// Accounts, passwords and sessions.

export const ROLES = ['admin', 'manager', 'artist'];
const SESSION_COOKIE = 'pl_session';
const SESSION_DAYS = 7;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
// PBKDF2 must fit the Workers free plan's 10 ms CPU budget per request (~4 ms at 20,000).
// Raise PASSWORD_ITERATIONS (max 100,000 on Workers) on a paid plan; older hashes upgrade at the next sign-in.
const DEFAULT_ITERATIONS = 20000;
// Plain names or email addresses.
const USERNAME_RE = /^[a-zA-Z0-9._@+-]{3,80}$/;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const enc = new TextEncoder();

const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
const base64url = (bytes) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const passwordIterations = (env) => {
  const n = Number.parseInt(env.PASSWORD_ITERATIONS ?? '', 10);
  return Number.isInteger(n) && n >= 10000 && n <= 100000 ? n : DEFAULT_ITERATIONS;
};

const pbkdf2 = async (password, salt, iterations) => {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
};

export const hashPassword = async (password, iterations) => {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, iterations);
  return { hash: toBase64(hash), salt: toBase64(salt), iterations };
};

const equalBytes = (a, b) => {
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  if (x.length !== y.length) return false;
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(x, y);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
};

const verifyPassword = async (password, user) => {
  const hash = await pbkdf2(password, fromBase64(user.password_salt), user.password_iterations);
  return equalBytes(hash, fromBase64(user.password_hash));
};

const sha256Hex = async (text) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));

const nowIso = () => new Date().toISOString();

export const validatePassword = (password) => {
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'Passwords must be at least 8 characters');
  if (password.length > 200) throw new HttpError(400, 'Password is too long');
};

const validateUsername = (username) => {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new HttpError(400, 'Usernames are 3–80 characters: letters, numbers and . _ - + @ (an email address works)');
  }
};

const validateDisplayName = (name) => {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) throw new HttpError(400, 'Enter a name of up to 60 characters');
};

export const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  displayName: u.display_name,
  role: u.role,
  active: !!u.active,
  createdAt: u.created_at,
  lastLoginAt: u.last_login_at || null,
  locked: !!(u.locked_until && u.locked_until > nowIso()),
});

const readCookie = (request, name) => {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
};

const cookieHeader = (request, value, maxAgeSeconds) => {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
};

// The signed-in user for this request, or null.
export const currentUser = async (request, env) => {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(`SELECT u.*, s.expires_at AS session_expires FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND u.active = 1`).bind(tokenHash, nowIso()).first();
  if (!row) return null;
  // Keep active people signed in: extend the session once it is more than a day old.
  const renewAfter = new Date(Date.now() + (SESSION_DAYS - 1) * 86400000).toISOString();
  if (row.session_expires < renewAfter) {
    const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    await env.DB.prepare('UPDATE sessions SET expires_at = ?2 WHERE token_hash = ?1').bind(tokenHash, expires).run();
  }
  return row;
};

export const requireUser = async (request, env) => {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, 'Please sign in');
  return user;
};

export const isManager = (user) => user.role === 'admin' || user.role === 'manager';

export const requireRole = (user, roles) => {
  if (!roles.includes(user.role)) throw new HttpError(403, 'Your account is not allowed to do this');
};

const json = (body, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  });

export const login = async (request, env, body) => {
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || !password || username.length > 40 || password.length > 200) throw new HttpError(400, 'Enter your username and password');

  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?1').bind(username).first();
  const now = nowIso();
  if (!user || !user.active) {
    // Same work as a real check, so response time doesn't reveal which usernames exist.
    await pbkdf2(password, randomBytes(16), passwordIterations(env));
    throw new HttpError(401, 'Wrong username or password');
  }
  if (user.locked_until && user.locked_until > now) {
    throw new HttpError(429, 'Too many wrong attempts. Try again in a few minutes, or ask an admin to reset your password.');
  }
  if (!(await verifyPassword(password, user))) {
    const attempts = user.failed_attempts + 1;
    const lockUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
    await env.DB.prepare('UPDATE users SET failed_attempts = ?2, locked_until = ?3 WHERE id = ?1')
      .bind(user.id, lockUntil ? 0 : attempts, lockUntil).run();
    throw new HttpError(401, 'Wrong username or password');
  }

  const token = base64url(randomBytes(32));
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  const statements = [
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(await sha256Hex(token), user.id, now, expires),
    env.DB.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ?2 WHERE id = ?1').bind(user.id, now),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1 AND expires_at <= ?2').bind(user.id, now),
  ];
  if (user.password_iterations < passwordIterations(env)) {
    const upgraded = await hashPassword(password, passwordIterations(env));
    statements.push(env.DB.prepare('UPDATE users SET password_hash = ?2, password_salt = ?3, password_iterations = ?4 WHERE id = ?1')
      .bind(user.id, upgraded.hash, upgraded.salt, upgraded.iterations));
  }
  await env.DB.batch(statements);
  return json({ user: publicUser(user) }, 200, { 'set-cookie': cookieHeader(request, token, SESSION_DAYS * 86400) });
};

export const logout = async (request, env) => {
  const token = readCookie(request, SESSION_COOKIE);
  if (token && token.length <= 100) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256Hex(token)).run();
  }
  return json({ ok: true }, 200, { 'set-cookie': cookieHeader(request, '', 0) });
};

// ----- admin: accounts -----

const activeAdminCount = async (env) =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").first()).n;

export const listUsers = async (env) => {
  const { results } = await env.DB.prepare('SELECT * FROM users ORDER BY active DESC, display_name COLLATE NOCASE').all();
  return json({ users: results.map(publicUser) });
};

export const createUser = async (env, body) => {
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  validateUsername(username);
  validateDisplayName(body?.displayName);
  if (!ROLES.includes(body?.role)) throw new HttpError(400, 'Pick a role');
  validatePassword(body?.password);
  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?1').bind(username).first();
  if (existing) throw new HttpError(409, `The username "${username}" is already taken`);
  const pw = await hashPassword(body.password, passwordIterations(env));
  const now = nowIso();
  const id = base64url(randomBytes(12));
  await env.DB.prepare(`INSERT INTO users (id, username, display_name, role, password_hash, password_salt, password_iterations, active, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)`)
    .bind(id, username, body.displayName.trim(), body.role, pw.hash, pw.salt, pw.iterations, now).run();
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(id).first();
  return json({ user: publicUser(user) }, 201);
};

export const updateUser = async (env, admin, id, body) => {
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(id).first();
  if (!user) throw new HttpError(404, 'Account not found');
  const now = nowIso();
  const sets = [];
  const binds = [];
  const add = (column, value) => { binds.push(value); sets.push(`${column} = ?${binds.length + 1}`); };
  let endSessions = false;

  if (body.displayName !== undefined) {
    validateDisplayName(body.displayName);
    add('display_name', body.displayName.trim());
  }
  const losesAdmin = (body.role !== undefined && body.role !== 'admin') || body.active === false;
  if (user.role === 'admin' && user.active && losesAdmin && (await activeAdminCount(env)) <= 1) {
    throw new HttpError(400, 'Keep at least one active admin account');
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) throw new HttpError(400, 'Pick a role');
    add('role', body.role);
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') throw new HttpError(400, 'active must be true or false');
    if (!body.active && user.id === admin.id) throw new HttpError(400, 'You can’t turn off your own account');
    add('active', body.active ? 1 : 0);
    if (!body.active) endSessions = true;
  }
  if (body.password !== undefined) {
    validatePassword(body.password);
    const pw = await hashPassword(body.password, passwordIterations(env));
    add('password_hash', pw.hash);
    add('password_salt', pw.salt);
    add('password_iterations', pw.iterations);
    add('failed_attempts', 0);
    add('locked_until', null);
    endSessions = user.id !== admin.id;
  }
  if (body.unlock === true) {
    add('failed_attempts', 0);
    add('locked_until', null);
  }
  if (!sets.length) throw new HttpError(400, 'Nothing to change');
  add('updated_at', now);

  const statements = [env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?1`).bind(id, ...binds)];
  if (endSessions) statements.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(id));
  await env.DB.batch(statements);
  const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(id).first();
  return json({ user: publicUser(updated) });
};

// Only accounts that were never used can be deleted; used ones are turned off so their history keeps a name.
export const deleteUser = async (env, admin, id) => {
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(id).first();
  if (!user) throw new HttpError(404, 'Account not found');
  if (user.id === admin.id) throw new HttpError(400, 'You can’t delete your own account');
  if (user.last_login_at) throw new HttpError(400, 'This account has been used — turn it off instead so its history stays');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(id),
  ]);
  return json({ ok: true });
};
