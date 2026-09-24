// API for the shared pipeline data. Static files are served by the assets binding; only /api/* runs here.
// D1 on the free plan allows 50 statements per request, so every endpoint uses a handful of statements
// and passes lists of records as one JSON parameter (json_each) instead of one statement per record.

import {
  HttpError, createUser, currentUser, deleteUser, isManager, listUsers, login, logout, publicUser,
  requireRole, requireUser, updateUser,
} from './auth';

const KINDS = new Set(['project', 'manager', 'stage', 'event', 'artist', 'artistlog', 'comment']);
const STAGES = new Set(['', 'Modelling', 'Texturing', 'Lighting']);
const MAX_BODY_BYTES = 1_800_000;
const MAX_OPS = 3000;
const CHANGES_LIMIT = 5000;
const SEED_CLAIM_TTL_SECONDS = 300;

// What a normal (artist) account may write: stage-sheet work, history entries, shared comments,
// and the Manager-sheet fields that stage actions update as a side effect (as the sheet scripts do).
const ARTIST_KINDS = new Set(['stage', 'event', 'comment', 'manager']);
const MANAGER_FIELDS_SET_BY_STAGES = new Set([
  'modRework', 'textRework', 'lightRework', 'modStatus', 'textStatus', 'mainStatus',
  'uploadDate', 'approvedDate', 'modArtist', 'textArtist', 'qaArtist',
]);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const readJson = async (request) => {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'Request is too large');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON');
  }
};

const isShortString = (v, max = 200) => typeof v === 'string' && v.length <= max;

const validateRecord = (r, { forDelete = false } = {}) => {
  if (!r || typeof r !== 'object') throw new HttpError(400, 'Each record must be an object');
  if (!KINDS.has(r.kind)) throw new HttpError(400, `Unknown record kind: ${r.kind}`);
  if (!isShortString(r.id) || !r.id) throw new HttpError(400, 'Record id must be a non-empty string');
  if (!isShortString(r.project ?? '')) throw new HttpError(400, 'Project name is too long');
  if (!STAGES.has(r.stage ?? '')) throw new HttpError(400, `Unknown stage: ${r.stage}`);
  if (!forDelete && (r.data === null || typeof r.data !== 'object')) throw new HttpError(400, 'Record data must be an object');
};

const rowToRecord = (row) => ({
  kind: row.kind,
  id: row.id,
  project: row.project,
  stage: row.stage,
  data: row.deleted ? null : JSON.parse(row.data),
  version: row.version,
  deleted: !!row.deleted,
  seq: row.seq,
});

const currentSeq = (env) => env.DB.prepare("SELECT value FROM meta WHERE key = 'seq'");

const getState = async (env) => {
  const [records, seq, seeded] = await env.DB.batch([
    env.DB.prepare('SELECT kind, id, project, stage, data, version, deleted, seq FROM records WHERE deleted = 0 ORDER BY rowid'),
    currentSeq(env),
    env.DB.prepare("SELECT value FROM meta WHERE key = 'seeded'"),
  ]);
  return json({
    seq: seq.results[0]?.value ?? 0,
    seeded: seeded.results.length > 0,
    records: records.results.map(rowToRecord),
  });
};

const getChanges = async (env, url) => {
  const since = Number.parseInt(url.searchParams.get('since') ?? '0', 10);
  if (!Number.isFinite(since) || since < 0) throw new HttpError(400, 'since must be a non-negative number');
  const [changes, seq] = await env.DB.batch([
    env.DB.prepare('SELECT kind, id, project, stage, data, version, deleted, seq FROM records WHERE seq > ?1 ORDER BY seq, rowid LIMIT ?2')
      .bind(since, CHANGES_LIMIT),
    currentSeq(env),
  ]);
  let rows = changes.results;
  let upTo = seq.results[0]?.value ?? since;
  let more = false;
  if (rows.length === CHANGES_LIMIT) {
    // Never split one write across two pages: finish the last write's records, then continue from there.
    const lastSeq = rows[rows.length - 1].seq;
    const rest = await env.DB.prepare('SELECT kind, id, project, stage, data, version, deleted, seq FROM records WHERE seq = ?1 ORDER BY rowid')
      .bind(lastSeq)
      .all();
    rows = [...rows.filter((r) => r.seq !== lastSeq), ...rest.results];
    upTo = lastSeq;
    more = true;
  }
  return json({ seq: upTo, more, records: rows.map(rowToRecord) });
};

const checkArtistChanges = async (env, ops) => {
  for (const op of ops) {
    if (op.deleted) throw new HttpError(403, 'Only managers can delete things');
    if (!ARTIST_KINDS.has(op.kind)) throw new HttpError(403, 'Only managers can change projects, the team list or weekly entries');
    if (op.kind === 'event' && op.baseVersion !== null) throw new HttpError(403, 'History entries can’t be edited');
    if (op.kind === 'manager' && op.baseVersion === null) throw new HttpError(403, 'Only managers can add assets');
  }
  const managerOps = ops.filter((op) => op.kind === 'manager');
  if (!managerOps.length) return;
  const { results } = await env.DB.prepare("SELECT id, data FROM records WHERE kind = 'manager' AND id IN (SELECT value FROM json_each(?1))")
    .bind(JSON.stringify(managerOps.map((op) => op.id)))
    .all();
  const stored = new Map(results.map((r) => [r.id, JSON.parse(r.data)]));
  for (const op of managerOps) {
    const before = stored.get(op.id) || {};
    for (const field of new Set([...Object.keys(before), ...Object.keys(op.data)])) {
      if (!MANAGER_FIELDS_SET_BY_STAGES.has(field) && JSON.stringify(before[field]) !== JSON.stringify(op.data[field])) {
        throw new HttpError(403, 'Only managers can edit the Manager sheet');
      }
    }
  }
};

const mutate = async (env, request, user) => {
  const body = await readJson(request);
  const ops = body?.ops;
  if (!Array.isArray(ops) || ops.length === 0) throw new HttpError(400, 'ops must be a non-empty array');
  if (ops.length > MAX_OPS) throw new HttpError(413, 'Too many changes in one request');

  const seen = new Set();
  const clean = ops.map((op) => {
    const deleted = op?.deleted === true;
    validateRecord(op, { forDelete: deleted });
    const key = `${op.kind}\u0000${op.id}`;
    if (seen.has(key)) throw new HttpError(400, 'The same record appears twice in one request');
    seen.add(key);
    if (op.baseVersion !== null && !Number.isInteger(op.baseVersion)) throw new HttpError(400, 'baseVersion must be an integer or null');
    let data = deleted ? {} : op.data;
    // History entries are signed by the server, so they can't claim to be from someone else.
    if (op.kind === 'event' && !deleted) data = { ...data, by: user.display_name, byUser: user.username };
    return {
      kind: op.kind,
      id: op.id,
      project: op.project ?? '',
      stage: op.stage ?? '',
      data,
      deleted: deleted ? 1 : 0,
      baseVersion: op.baseVersion ?? null,
    };
  });

  if (!isManager(user)) await checkArtistChanges(env, clean);

  const opsJson = JSON.stringify(clean);
  const now = new Date().toISOString();
  const db = env.DB;
  try {
    const results = await db.batch([
      db.prepare("UPDATE meta SET value = value + 1 WHERE key = 'seq'"),
      // Abort the whole batch if any record changed since this browser last saw it (or already exists, for new records).
      db.prepare(`INSERT INTO version_guard (ok)
        SELECT 1 FROM json_each(?1) AS op
        WHERE CASE
          WHEN json_extract(op.value, '$.baseVersion') IS NULL THEN EXISTS (
            SELECT 1 FROM records r
            WHERE r.kind = json_extract(op.value, '$.kind') AND r.id = json_extract(op.value, '$.id') AND r.deleted = 0)
          ELSE NOT EXISTS (
            SELECT 1 FROM records r
            WHERE r.kind = json_extract(op.value, '$.kind') AND r.id = json_extract(op.value, '$.id')
              AND r.version = json_extract(op.value, '$.baseVersion'))
        END`).bind(opsJson),
      db.prepare(`INSERT INTO records (kind, id, project, stage, data, version, deleted, seq, updated_at, updated_by)
        SELECT json_extract(op.value, '$.kind'), json_extract(op.value, '$.id'), json_extract(op.value, '$.project'),
               json_extract(op.value, '$.stage'), json_extract(op.value, '$.data'), 1, 0,
               (SELECT value FROM meta WHERE key = 'seq'), ?2, ?3
        FROM json_each(?1) AS op
        WHERE json_extract(op.value, '$.deleted') = 0
        ON CONFLICT (kind, id) DO UPDATE SET
          project = excluded.project, stage = excluded.stage, data = excluded.data,
          version = records.version + 1, deleted = 0, seq = excluded.seq,
          updated_at = excluded.updated_at, updated_by = excluded.updated_by`).bind(opsJson, now, user.username),
      db.prepare(`UPDATE records
        SET deleted = 1, version = version + 1, seq = (SELECT value FROM meta WHERE key = 'seq'), updated_at = ?2, updated_by = ?3
        WHERE (kind, id) IN (
          SELECT json_extract(value, '$.kind'), json_extract(value, '$.id') FROM json_each(?1)
          WHERE json_extract(value, '$.deleted') = 1)`).bind(opsJson, now, user.username),
      db.prepare(`SELECT kind, id, version FROM records
        WHERE (kind, id) IN (SELECT json_extract(value, '$.kind'), json_extract(value, '$.id') FROM json_each(?1))`).bind(opsJson),
      currentSeq(env),
    ]);
    const versions = {};
    for (const row of results[4].results) versions[`${row.kind}:${row.id}`] = row.version;
    return json({ ok: true, seq: results[5].results[0]?.value ?? 0, versions });
  } catch (err) {
    if (String(err?.message || err).includes('CHECK constraint failed')) {
      return json({ ok: false, conflict: true, error: 'Someone else changed this at the same time' }, 409);
    }
    throw err;
  }
};

// First run only: an admin's browser claims the right to fill the empty database, then uploads in chunks.
const claimSeed = async (env) => {
  const now = Math.floor(Date.now() / 1000);
  const [seeded, claim] = await env.DB.batch([
    env.DB.prepare("SELECT value FROM meta WHERE key = 'seeded'"),
    env.DB.prepare(`INSERT INTO meta (key, value) VALUES ('seed_claim', ?1)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value
      WHERE meta.value < ?1 - ?2 AND NOT EXISTS (SELECT 1 FROM meta WHERE key = 'seeded')`).bind(now, SEED_CLAIM_TTL_SECONDS),
  ]);
  if (seeded.results.length) return json({ claimed: false, seeded: true });
  return json({ claimed: claim.meta.changes > 0, seeded: false });
};

const seed = async (env, request, user) => {
  const body = await readJson(request);
  const records = body?.records;
  if (!Array.isArray(records) || records.length > MAX_OPS) throw new HttpError(400, 'records must be an array of at most 3000 records');
  records.forEach((r) => validateRecord(r));
  const [seeded, claim] = await env.DB.batch([
    env.DB.prepare("SELECT value FROM meta WHERE key = 'seeded'"),
    env.DB.prepare("SELECT value FROM meta WHERE key = 'seed_claim'"),
  ]);
  if (seeded.results.length) throw new HttpError(409, 'The database has already been set up');
  if (!claim.results.length) throw new HttpError(409, 'Claim the setup first');

  const recordsJson = JSON.stringify(records.map((r) => ({ kind: r.kind, id: r.id, project: r.project ?? '', stage: r.stage ?? '', data: r.data })));
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare("UPDATE meta SET value = value + 1 WHERE key = 'seq'"),
    env.DB.prepare(`INSERT OR IGNORE INTO records (kind, id, project, stage, data, version, deleted, seq, updated_at, updated_by)
      SELECT json_extract(value, '$.kind'), json_extract(value, '$.id'), json_extract(value, '$.project'),
             json_extract(value, '$.stage'), json_extract(value, '$.data'), 1, 0, (SELECT value FROM meta WHERE key = 'seq'), ?2, ?3
      FROM json_each(?1)`).bind(recordsJson, now, user.username),
  ];
  if (body.done === true) statements.push(env.DB.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('seeded', 1)"));
  await env.DB.batch(statements);
  return json({ ok: true, done: body.done === true });
};

const handleApi = async (request, env, url) => {
  // Browsers only send a JSON content type cross-site after a CORS preflight this API never grants,
  // so requiring it (together with SameSite cookies) blocks cross-site request forgery.
  if (request.method !== 'GET' && !(request.headers.get('content-type') || '').includes('application/json')) {
    throw new HttpError(415, 'Send JSON');
  }

  const route = `${request.method} ${url.pathname}`;
  if (route === 'POST /api/login') return login(request, env, await readJson(request));
  if (route === 'POST /api/logout') return logout(request, env);
  if (route === 'GET /api/me') {
    const user = await currentUser(request, env);
    return user ? json({ user: publicUser(user) }) : json({ ok: false, error: 'Please sign in' }, 401);
  }

  const user = await requireUser(request, env);
  const userRoute = url.pathname.match(/^\/api\/users\/([A-Za-z0-9_-]{1,40})$/);
  if (userRoute) {
    requireRole(user, ['admin']);
    if (request.method === 'PATCH') return updateUser(env, user, userRoute[1], await readJson(request));
    if (request.method === 'DELETE') return deleteUser(env, user, userRoute[1]);
    throw new HttpError(405, 'Method not allowed');
  }

  switch (route) {
    case 'GET /api/state': return getState(env);
    case 'GET /api/changes': return getChanges(env, url);
    case 'POST /api/mutate': return mutate(env, request, user);
    case 'POST /api/seed/claim': requireRole(user, ['admin']); return claimSeed(env);
    case 'POST /api/seed': requireRole(user, ['admin']); return seed(env, request, user);
    case 'GET /api/users': requireRole(user, ['admin']); return listUsers(env);
    case 'POST /api/users': requireRole(user, ['admin']); return createUser(env, await readJson(request));
    default: throw new HttpError(404, 'Not found');
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      if (err instanceof HttpError) return json({ ok: false, error: err.message }, err.status);
      console.error(err);
      return json({ ok: false, error: 'Something went wrong on the server' }, 500);
    }
  },
};
