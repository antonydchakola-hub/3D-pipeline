export const STAGES = ['Modelling', 'Texturing', 'Lighting'];

export const STAGE_LABEL = {
  Manager: 'Manager queue',
  Modelling: 'Modelling',
  Texturing: 'Texturing',
  Lighting: 'Lighting / QA',
};

export const STAGE_TONE = { Modelling: 'mod', Texturing: 'tex', Lighting: 'light' };

export const REWORK_FIELD = { Modelling: 'modRework', Texturing: 'textRework', Lighting: 'lightRework' };

export const PRIORITIES = ['High Priority', 'Medium Priority', 'Low Priority'];
export const COMPLEXITIES = ['Very Simple', 'Simple', 'Medium', 'Hard', 'Very Hard'];
export const TYPES = ['new', 'rework'];
export const ROLES = ['Artist', 'Manager'];
export const MAIN_STATUSES = ['Uploaded', 'Approved', 'Rework'];

export const STATUS_OPTIONS = {
  Modelling: ['Done', 'Rework', 'Split', 'Split Done'],
  Texturing: ['Done', 'Rework (Modelling)', 'Rework (Texturing)', 'Split', 'Split Done'],
  Lighting: ['Uploaded', 'Approved', 'Rework (Modelling)', 'Rework (Texturing)', 'Rework (Lighting)', 'Split', 'Split Done'],
};

export const SEND_BACK_OPTIONS = {
  Modelling: [{ label: 'Modelling (internal fix)', status: 'Rework' }],
  Texturing: [
    { label: 'Modelling', status: 'Rework (Modelling)' },
    { label: 'Texturing (internal fix)', status: 'Rework (Texturing)' },
  ],
  Lighting: [
    { label: 'Modelling', status: 'Rework (Modelling)' },
    { label: 'Texturing', status: 'Rework (Texturing)' },
    { label: 'Lighting (internal fix)', status: 'Rework (Lighting)' },
  ],
};

const ARCHIVED = new Set(['Archived Rework', 'Archived Split']);
const STAGE_ORDER = { Modelling: 0, Texturing: 1, Lighting: 2 };

const sentTo = (status) => (String(status || '').startsWith('Sent to ') ? String(status).slice(8) : null);
// "Sent to Modelling" on a Texturing or Lighting row means it was sent back, as in the sheets.
export const isSendBack = (stage, status) => {
  const target = sentTo(status);
  return !!target && stage in STAGE_ORDER && target in STAGE_ORDER && STAGE_ORDER[target] < STAGE_ORDER[stage];
};

export const isArchived = (row) => ARCHIVED.has(row?.status);
// Rows that already handed off; re-running a transition on them would duplicate the asset.
// An archived split stays editable so the original can still be finished (Done / Split Done), as in the sheets.
export const isLocked = (row) => row?.status === 'Archived Rework' || !!sentTo(row?.status);
export const isClosed = (row) => isArchived(row) || !!sentTo(row?.status) || row?.status === 'Split Done';
export const isOpen = (row) => !isClosed(row) && row?.status !== 'Approved';

export const toISODate = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
export const todayISO = () => toISODate(new Date());

const parseISO = (iso) => new Date(`${iso}T00:00:00`);

export const addDays = (iso, days) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

export const daysBetween = (fromISO, toISO) => Math.round((parseISO(toISO) - parseISO(fromISO)) / 86400000);

export const formatDate = (iso) => {
  if (!iso) return '';
  const d = parseISO(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

export const formatTimestamp = (isoTimestamp) => {
  const d = new Date(isoTimestamp);
  return {
    day: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
};

export const hours = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

export const formatHours = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const priorityShort = (p) => (p ? p.replace(' Priority', '') : '');

export const rowsFor = (data, stage, project) => data?.[stage]?.[project] || [];

export const isDispatched = (data, project, tcn) =>
  !!tcn && STAGES.some((stage) => rowsFor(data, stage, project).some((r) => r.tcn === tcn));

export const currentPosition = (data, project, tcn) => {
  if (!tcn) return null;
  for (const stage of ['Lighting', 'Texturing', 'Modelling']) {
    const rows = rowsFor(data, stage, project).filter((r) => r.tcn === tcn && !isClosed(r));
    if (rows.length) return { stage, row: rows[rows.length - 1] };
  }
  return null;
};

export const stageSnapshot = (data, project, stage, tcn) => {
  const rows = rowsFor(data, stage, project).filter((r) => r.tcn === tcn);
  if (!rows.length) return null;
  const open = rows.filter((r) => !isClosed(r));
  return open[open.length - 1] || rows[rows.length - 1];
};

// One comment per TCN, shared by every sheet. Until someone edits it, it falls back to the latest note written on a stage row.
export const assetComment = (data, project, tcn) => {
  if (!tcn) return '';
  const stored = data?.assetComments?.[project]?.[tcn];
  if (stored !== undefined) return stored;
  const pos = currentPosition(data, project, tcn);
  if (pos?.row?.comments) return pos.row.comments;
  for (const stage of ['Lighting', 'Texturing', 'Modelling']) {
    const withNote = rowsFor(data, stage, project).filter((r) => r.tcn === tcn && r.comments);
    if (withNote.length) return withNote[withNote.length - 1].comments;
  }
  return '';
};

export const displayStatus = (status, stage) => {
  if (!status) return '';
  if (isSendBack(stage, status)) return 'Sent back';
  if (status.startsWith('Sent to')) return 'Done';
  if (status === 'Archived Rework') return 'Sent back';
  if (status === 'Archived Split') return 'Split';
  return status;
};

export const statusTone = (status, stage) => {
  if (!status) return 'empty';
  if (isSendBack(stage, status)) return 'rework';
  if (status === 'Approved') return 'good-solid';
  if (status === 'Done' || status === 'Split Done' || status.startsWith('Sent to')) return 'good';
  if (status.startsWith('Rework') || status === 'Archived Rework' || status === 'Sent back') return 'rework';
  if (status === 'Uploaded') return 'light';
  return 'neutral';
};

export const priorityTone = (p) => {
  if (p === 'High Priority') return 'danger-solid';
  if (p === 'Medium Priority') return 'amber';
  return p ? 'neutral' : 'empty';
};
export const typeTone = (t) => (t === 'rework' ? 'rework' : t === 'new' ? 'brand' : 'empty');

export const isOverdue = (row, today = todayISO()) =>
  !!row?.dueDate && row.dueDate < today && isOpen(row);

export const assetStage = (data, project, mgrRow) => {
  const tcn = mgrRow?.tcin;
  if (mgrRow?.mainStatus === 'Approved') return { key: 'approved', label: 'Approved', tone: 'good-solid' };
  const pos = currentPosition(data, project, tcn);
  if (pos?.stage === 'Lighting' && pos.row.status === 'Approved') return { key: 'approved', label: 'Approved', tone: 'good-solid', ...pos };
  if (mgrRow?.mainStatus === 'Uploaded' || (pos?.stage === 'Lighting' && pos.row.status === 'Uploaded')) {
    return { key: 'uploaded', label: 'Uploaded', tone: 'light', ...pos };
  }
  if (mgrRow?.mainStatus === 'Rework') {
    return { key: 'rework', label: pos ? `Rework · ${pos.stage}` : 'Rework', tone: 'rework', ...pos };
  }
  if (!pos) {
    if (!isDispatched(data, project, tcn)) return { key: 'queue', label: 'Queue', tone: 'neutral' };
    const wasSplit = STAGES.some((stage) => rowsFor(data, stage, project).some((r) => r.tcn === tcn && r.status === 'Archived Split'));
    return wasSplit
      ? { key: 'split', label: 'Split into sub-assets', tone: 'neutral' }
      : { key: 'idle', label: 'No open row', tone: 'neutral' };
  }
  if (pos.row.type === 'rework') {
    return { key: pos.stage, label: `Rework · ${pos.stage}`, tone: 'rework', ...pos };
  }
  return { key: pos.stage, label: `In ${pos.stage.toLowerCase()}`, tone: STAGE_TONE[pos.stage], ...pos };
};

const isSignedOff = (data, project, tcn) => {
  const pos = currentPosition(data, project, tcn);
  return pos?.stage === 'Lighting' && pos.row.status === 'Approved';
};

// An asset is complete once approved; a split asset once every one of its sub-assets is approved.
export const isAssetComplete = (data, project, mgrRow) => {
  const stage = assetStage(data, project, mgrRow);
  if (stage.key === 'approved') return true;
  if (stage.key !== 'split') return false;
  const children = new Set(
    STAGES.flatMap((s) => rowsFor(data, s, project).filter((r) => r.tcn?.startsWith(`${mgrRow.tcin}-`)).map((r) => r.tcn)),
  );
  return children.size > 0 && [...children].every((tcn) => isSignedOff(data, project, tcn));
};

export const projectProgress = (data, project) => {
  const assets = rowsFor(data, 'Manager', project).filter((r) => r.tcin);
  const done = assets.filter((r) => isAssetComplete(data, project, r)).length;
  return { total: assets.length, done, complete: assets.length > 0 && done === assets.length };
};

export const openRows = (data, stage, project) => rowsFor(data, stage, project).filter(isOpen);

export const stageHealth = (data, project, today = todayISO()) => {
  const mgr = rowsFor(data, 'Manager', project);
  const queue = mgr.filter((r) => r.tcin && !isDispatched(data, project, r.tcin));
  const stages = {};
  for (const stage of STAGES) {
    const rows = openRows(data, stage, project);
    const overdue = rows.filter((r) => isOverdue(r, today)).length;
    const rework = rows.filter((r) => r.type === 'rework' && !isOverdue(r, today)).length;
    stages[stage] = { total: rows.length, overdue, rework, fresh: rows.length - overdue - rework };
  }
  const approved = mgr.filter((r) => r.mainStatus === 'Approved');
  const weekAgo = addDays(today, -7);
  return {
    queue: {
      total: queue.length,
      high: queue.filter((r) => r.priority === 'High Priority').length,
      medium: queue.filter((r) => r.priority === 'Medium Priority').length,
      low: queue.filter((r) => r.priority === 'Low Priority').length,
    },
    stages,
    approved: {
      total: approved.length,
      week: approved.filter((r) => r.approvedDate && r.approvedDate > weekAgo).length,
    },
  };
};

export const weekStart = (iso) => {
  const d = parseISO(iso);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return toISODate(d);
};

export const consoleMetrics = (data, project, today = todayISO()) => {
  const mgr = rowsFor(data, 'Manager', project);
  const events = data?.events?.[project] || [];

  const open = STAGES.flatMap((stage) => openRows(data, stage, project).map((row) => ({ stage, row })));
  const inFlight = new Set(open.map((o) => o.row.tcn)).size;
  const overdue = open.filter((o) => isOverdue(o.row, today));

  const dispatched = mgr.filter((r) => isDispatched(data, project, r.tcin));
  const sentBackOnce = dispatched.filter((r) => (r.modRework || 0) + (r.textRework || 0) + (r.lightRework || 0) > 0);
  const reworkRate = dispatched.length ? Math.round((sentBackOnce.length / dispatched.length) * 100) : null;

  const health = stageHealth(data, project, today);
  const funnel = [
    { stage: 'Manager', label: 'Queue', count: health.queue.total, sentBack: 0 },
    ...STAGES.map((stage) => ({
      stage,
      label: STAGE_LABEL[stage],
      count: health.stages[stage].total,
      sentBack: openRows(data, stage, project).filter((r) => r.type === 'rework').length,
    })),
  ];

  const reworkTotals = {
    Modelling: mgr.reduce((s, r) => s + (r.modRework || 0), 0),
    Texturing: mgr.reduce((s, r) => s + (r.textRework || 0), 0),
    Lighting: mgr.reduce((s, r) => s + (r.lightRework || 0), 0),
  };
  const reworkSum = reworkTotals.Modelling + reworkTotals.Texturing + reworkTotals.Lighting;

  const thisWeek = weekStart(today);
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(thisWeek, (i - 5) * 7));
  const reworkByWeek = Object.fromEntries(STAGES.map((stage) => [stage, weeks.map(() => 0)]));
  for (const ev of events) {
    if (ev.kind !== 'rework' || !reworkByWeek[ev.stage]) continue;
    const idx = weeks.indexOf(weekStart(toISODate(new Date(ev.at))));
    if (idx >= 0) reworkByWeek[ev.stage][idx] += 1;
  }

  const byArtist = new Map();
  for (const { row } of open) {
    if (!row.artist) continue;
    const entry = byArtist.get(row.artist) || { artist: row.artist, alloc: 0, spent: 0, assets: 0 };
    entry.alloc += hours(row.allocTime);
    entry.spent += hours(row.timeSpent) + hours(row.reworkTime);
    entry.assets += 1;
    byArtist.set(row.artist, entry);
  }
  const workload = [...byArtist.values()].sort((a, b) => b.alloc - a.alloc || b.spent - a.spent);

  const days = Array.from({ length: 10 }, (_, i) => addDays(today, i));
  const emptyCounts = () => ({ Modelling: [], Texturing: [], Lighting: [] });
  const late = emptyCounts();
  const byDay = days.map(() => emptyCounts());
  for (const { stage, row } of open) {
    if (!row.dueDate) continue;
    if (row.dueDate < today) late[stage].push(row.tcn);
    else {
      const idx = days.indexOf(row.dueDate);
      if (idx >= 0) byDay[idx][stage].push(row.tcn);
    }
  }

  return {
    inFlight,
    approvedWeek: health.approved.week,
    approvedTotal: health.approved.total,
    reworkRate,
    sentBackOnce: sentBackOnce.length,
    dispatchedCount: dispatched.length,
    overdue,
    funnel,
    reworkTotals,
    reworkSum,
    weeks,
    reworkByWeek,
    workload,
    due: { days, byDay, late },
  };
};

export const activeArtists = (data) => (data?.artists || []).filter((a) => a.active !== false);

// Names offered in a stage's Artist dropdown: active artists who work in that stage (everyone active if none do).
export const artistOptions = (data, stage) => {
  const active = activeArtists(data);
  const forStage = stage ? active.filter((a) => a.stages?.includes(stage)) : active;
  return (forStage.length ? forStage : active).map((a) => a.name).sort((a, b) => a.localeCompare(b));
};

export const artistUsage = (data, name) => {
  let rows = 0;
  for (const stage of STAGES) {
    for (const projectRows of Object.values(data?.[stage] || {})) rows += projectRows.filter((r) => r.artist === name).length;
  }
  for (const projectRows of Object.values(data?.Manager || {})) {
    rows += projectRows.filter((r) => r.modArtist === name || r.textArtist === name || r.qaArtist === name).length;
  }
  return rows;
};

// Mirrors the sheets' syncToArtistSheet: a row credits its artist once it is closed by Done, a rework,
// Split Done, Uploaded or Approved (an uploaded row stays credited once approved; it is not counted twice).
export const isCreditedRow = (row) => {
  const s = String(row?.status || '');
  return s.startsWith('Sent to') || s === 'Archived Rework' || s === 'Split Done' || s === 'Uploaded' || s === 'Approved';
};

const blankArtist = (artist) => ({
  artist,
  completed: 0,
  inProgress: 0,
  byComplexity: Object.fromEntries([...COMPLEXITIES, ''].map((c) => [c, 0])),
  completedHours: 0,
  timeSpent: 0,
  reworkTime: 0,
  rows: [],
});

// Same rules as the Artist sheet: models and complexity count only "new" rows; completed hours add the
// allocated time, time spent adds time spent plus rework time, and rework adds rework time.
export const artistSummary = (data, projects, stage) => {
  const byArtist = new Map();
  for (const project of projects) {
    for (const row of rowsFor(data, stage, project)) {
      if (!row.artist) continue;
      if (!byArtist.has(row.artist)) byArtist.set(row.artist, blankArtist(row.artist));
      const a = byArtist.get(row.artist);
      const credited = isCreditedRow(row);
      a.rows.push({ project, row, credited });
      if (credited) {
        a.completedHours += hours(row.allocTime);
        a.timeSpent += hours(row.timeSpent) + hours(row.reworkTime);
        a.reworkTime += hours(row.reworkTime);
        if (String(row.type || '').trim().toLowerCase() === 'new') {
          a.completed += 1;
          a.byComplexity[COMPLEXITIES.includes(row.complexity) ? row.complexity : ''] += 1;
        }
      } else if (isOpen(row)) {
        a.inProgress += 1;
      }
    }
  }
  // Like the sheet, list everyone on the team for this stage, even with nothing done yet.
  for (const member of activeArtists(data)) {
    if (member.stages?.includes(stage) && !byArtist.has(member.name)) byArtist.set(member.name, blankArtist(member.name));
  }
  return [...byArtist.values()];
};

export const initials = (name) => {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

const AVATAR_TONES = ['mod', 'tex', 'light', 'amber'];
export const avatarTone = (name) => {
  let h = 0;
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
};

export const matchesQuery = (query, ...values) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((v) => String(v || '').toLowerCase().includes(q));
};
