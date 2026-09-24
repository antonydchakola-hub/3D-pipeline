// Converts between the app's in-memory data and the database's flat records, and works out which
// records an action changed so only those are sent to the server.

import { STAGES } from './pipelineModel';

export const recordKey = (r) => `${r.kind}:${r.id}`;

const emptyState = () => ({
  Manager: {}, Modelling: {}, Texturing: {}, Lighting: {},
  events: {}, artistLog: {}, assetComments: {}, artists: [],
});

const ensureProject = (state, project) => {
  if (!project) return;
  for (const collection of ['Manager', ...STAGES, 'events']) {
    if (!state[collection][project]) state[collection][project] = [];
  }
};

// Every record the state holds, each with a `sig`: the value that changes whenever the record changes
// (state updates are immutable, so an untouched row keeps the same object).
export const stateToRecords = (data) => {
  const out = [];
  for (const project of Object.keys(data.Manager || {})) {
    out.push({ kind: 'project', id: project, project, stage: '', data: { name: project }, sig: project });
  }
  for (const [project, rows] of Object.entries(data.Manager || {})) {
    for (const row of rows) out.push({ kind: 'manager', id: row.id, project, stage: '', data: row, sig: row });
  }
  for (const stage of STAGES) {
    for (const [project, rows] of Object.entries(data[stage] || {})) {
      for (const row of rows) out.push({ kind: 'stage', id: row.id, project, stage, data: row, sig: row });
    }
  }
  for (const [project, events] of Object.entries(data.events || {})) {
    for (const ev of events) out.push({ kind: 'event', id: ev.id, project, stage: '', data: ev, sig: ev });
  }
  for (const member of data.artists || []) {
    out.push({ kind: 'artist', id: member.id, project: '', stage: '', data: member, sig: member });
  }
  for (const [week, entries] of Object.entries(data.artistLog || {})) {
    for (const [artist, values] of Object.entries(entries || {})) {
      out.push({ kind: 'artistlog', id: `${week}|${artist}`, project: '', stage: '', data: { week, artist, values }, sig: values });
    }
  }
  for (const [project, comments] of Object.entries(data.assetComments || {})) {
    for (const [tcn, text] of Object.entries(comments || {})) {
      out.push({ kind: 'comment', id: `${project}|${tcn}`, project, stage: '', data: { tcn, text }, sig: text });
    }
  }
  return out;
};

export const recordsToState = (records) => {
  const state = emptyState();
  for (const r of records) if (r.kind === 'project') ensureProject(state, r.id);
  for (const r of records) applyRecordMutable(state, r);
  return state;
};

// Records changed between two states: upserts for new or changed ones, deletes for removed ones.
export const diffStates = (prev, next) => {
  const before = new Map(stateToRecords(prev).map((r) => [recordKey(r), r]));
  const ops = [];
  for (const r of stateToRecords(next)) {
    const key = recordKey(r);
    const old = before.get(key);
    before.delete(key);
    if (!old || old.sig !== r.sig || old.project !== r.project || old.stage !== r.stage) {
      ops.push({ kind: r.kind, id: r.id, project: r.project, stage: r.stage, data: r.data, deleted: false });
    }
  }
  for (const r of before.values()) ops.push({ kind: r.kind, id: r.id, project: r.project, stage: r.stage, deleted: true });
  return ops;
};

const upsertById = (list, item) => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const copy = list.slice();
  copy[i] = item;
  return copy;
};

const removeById = (list, id) => list.filter((x) => x.id !== id);

// Used while building a fresh state (mutates `state`).
function applyRecordMutable(state, r) {
  switch (r.kind) {
    case 'project':
      ensureProject(state, r.id);
      break;
    case 'manager':
      ensureProject(state, r.project);
      state.Manager[r.project].push(r.data);
      break;
    case 'stage':
      ensureProject(state, r.project);
      if (state[r.stage]) state[r.stage][r.project].push(r.data);
      break;
    case 'event':
      ensureProject(state, r.project);
      state.events[r.project].push(r.data);
      break;
    case 'artist':
      state.artists.push(r.data);
      break;
    case 'artistlog':
      state.artistLog[r.data.week] = { ...state.artistLog[r.data.week], [r.data.artist]: r.data.values };
      break;
    case 'comment':
      state.assetComments[r.project] = { ...state.assetComments[r.project], [r.data.tcn]: r.data.text };
      break;
    default:
      break;
  }
}

const withProject = (state, project) => {
  if (!project) return state;
  let next = state;
  for (const collection of ['Manager', ...STAGES, 'events']) {
    if (!next[collection][project]) next = { ...next, [collection]: { ...next[collection], [project]: [] } };
  }
  return next;
};

// Applies one record from another user to the current state immutably.
export const applyRemoteRecord = (state, r) => {
  const put = (collection, project, list) => ({ ...state, [collection]: { ...state[collection], [project]: list } });
  switch (r.kind) {
    case 'project':
      return r.deleted ? state : withProject(state, r.id);
    case 'manager': {
      state = withProject(state, r.project);
      const list = state.Manager[r.project];
      return put('Manager', r.project, r.deleted ? removeById(list, r.id) : upsertById(list, r.data));
    }
    case 'stage': {
      if (!STAGES.includes(r.stage)) return state;
      state = withProject(state, r.project);
      const list = state[r.stage][r.project];
      return put(r.stage, r.project, r.deleted ? removeById(list, r.id) : upsertById(list, r.data));
    }
    case 'event': {
      state = withProject(state, r.project);
      const list = state.events[r.project];
      return put('events', r.project, r.deleted ? removeById(list, r.id) : upsertById(list, r.data));
    }
    case 'artist':
      return { ...state, artists: r.deleted ? removeById(state.artists, r.id) : upsertById(state.artists, r.data) };
    case 'artistlog': {
      const [week, ...rest] = r.id.split('|');
      const artist = rest.join('|');
      const entries = { ...state.artistLog[week] };
      if (r.deleted) delete entries[artist];
      else entries[artist] = r.data.values;
      return { ...state, artistLog: { ...state.artistLog, [week]: entries } };
    }
    case 'comment': {
      const tcn = r.deleted ? r.id.slice(r.project.length + 1) : r.data.tcn;
      const comments = { ...state.assetComments[r.project] };
      if (r.deleted) delete comments[tcn];
      else comments[tcn] = r.data.text;
      return { ...state, assetComments: { ...state.assetComments, [r.project]: comments } };
    }
    default:
      return state;
  }
};

// Fired when the server says the session is gone, so the app can show the sign-in page.
export const UNAUTHORIZED_EVENT = 'pipeline:unauthorized';

export const api = async (path, options = {}) => {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.conflict = !!body?.conflict;
    if (res.status === 401 && path !== '/api/login' && path !== '/api/me') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw err;
  }
  return body;
};

export const fetchState = () => api('/api/state');
export const fetchChanges = (since) => api(`/api/changes?since=${encodeURIComponent(since)}`);
export const sendMutations = (ops) => api('/api/mutate', { method: 'POST', body: JSON.stringify({ ops }) });

// First run: fill the empty database with the starting data, in chunks small enough for one request each.
export const seedDatabase = async (data) => {
  const claim = await api('/api/seed/claim', { method: 'POST', body: '{}' });
  if (!claim.claimed) return false;
  const records = stateToRecords(data).map(({ sig: _sig, ...r }) => r);
  const chunks = [];
  let chunk = [];
  let size = 0;
  for (const r of records) {
    const bytes = JSON.stringify(r).length;
    if (chunk.length && (size + bytes > 700_000 || chunk.length >= 1500)) {
      chunks.push(chunk);
      chunk = [];
      size = 0;
    }
    chunk.push(r);
    size += bytes;
  }
  chunks.push(chunk);
  for (let i = 0; i < chunks.length; i++) {
    await api('/api/seed', { method: 'POST', body: JSON.stringify({ records: chunks[i], done: i === chunks.length - 1 }) });
  }
  return true;
};
