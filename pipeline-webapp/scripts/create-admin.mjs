#!/usr/bin/env node
// Creates an admin account directly in the database — used once, for the very first admin.
// After that, admins add every other account from the website (profile menu → Accounts).
//
//   npm run create-admin -- --remote   the live site's database
//   npm run create-admin -- --local    the local development database
//
// The password is typed hidden and never leaves this computer: only a salted PBKDF2 hash is stored,
// in the same format the website's sign-in uses.

import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const ITERATIONS = 20000; // keep in step with DEFAULT_ITERATIONS in worker/auth.js
// Plain names or email addresses.
const USERNAME_RE = /^[a-zA-Z0-9._@+-]{3,80}$/;

const target = process.argv.includes('--remote') ? '--remote' : process.argv.includes('--local') ? '--local' : null;
if (!target) {
  console.error('Say which database: npm run create-admin -- --remote   (live site)   or   -- --local   (development)');
  process.exit(1);
}
if (!process.stdin.isTTY) {
  console.error('Run this in PowerShell, Command Prompt or Windows Terminal so the password can be typed hidden.');
  process.exit(1);
}

const ask = (question) => new Promise((resolve) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
});

const askHidden = (question) => new Promise((resolve) => {
  process.stdout.write(question);
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  let value = '';
  const onData = (chunk) => {
    for (const ch of chunk) {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        process.stdout.write('\n');
        resolve(value);
        return;
      }
      if (ch === '\u0003') {
        process.stdout.write('\n');
        process.exit(1);
      }
      if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
      else value += ch;
    }
  };
  stdin.on('data', onData);
});

const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`;

const main = async () => {
  console.log(`Create an admin account in the ${target === '--remote' ? 'LIVE' : 'local development'} database.\n`);
  const username = await ask('Username: ');
  if (!USERNAME_RE.test(username)) throw new Error('Usernames are 3–80 characters: letters, numbers and . _ - + @ (an email address works).');
  const displayName = await ask('Full name (shown in the app): ');
  if (!displayName || displayName.length > 60) throw new Error('Enter a name of up to 60 characters.');
  const password = await askHidden('Password (hidden): ');
  if (password.length < 8) throw new Error('Passwords must be at least 8 characters.');
  const again = await askHidden('Type the password again: ');
  if (again !== password) throw new Error('The two passwords did not match.');

  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  const now = new Date().toISOString();
  const id = randomBytes(12).toString('base64url');
  const sql = `INSERT INTO users (id, username, display_name, role, password_hash, password_salt, password_iterations, active, created_at, updated_at)
VALUES (${sqlString(id)}, ${sqlString(username)}, ${sqlString(displayName)}, 'admin', ${sqlString(hash.toString('base64'))}, ${sqlString(salt.toString('base64'))}, ${ITERATIONS}, 1, ${sqlString(now)}, ${sqlString(now)});`;

  // Passed as a file so nothing needs shell quoting; the file holds only the hash, and is deleted straight away.
  const dir = mkdtempSync(join(tmpdir(), 'pipeline-admin-'));
  const file = join(dir, 'create-admin.sql');
  writeFileSync(file, sql);
  try {
    const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'pipeline-db', target, '--file', file, '--yes'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      encoding: 'utf8',
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    if (result.status !== 0) {
      if (output.includes('UNIQUE constraint failed')) throw new Error(`The username "${username}" already exists.`);
      throw new Error(`Wrangler could not write to the database:\n${output.slice(-1500)}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\nAdmin account "${username}" created. Sign in on the website and add everyone else from the profile menu → Accounts.`);
};

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
