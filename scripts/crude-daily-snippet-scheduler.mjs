#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PID_FILE = join(ROOT, '.config/crude-daily-snippet-scheduler.pid');
const LOG_FILE = join(ROOT, 'logs/crude-daily-snippet-scheduler.log');
const SEND_SCRIPT = join(ROOT, 'scripts/crude-daily-snippet-send-whatsapp.mjs');
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function appendLog(text) {
  mkdirSync(dirname(LOG_FILE), { recursive: true });
  writeFileSync(LOG_FILE, `[${new Date().toISOString()}] ${text}\n`, { flag: 'a' });
}

function sgtParts(date = new Date()) {
  const shifted = new Date(date.getTime() + SGT_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    day: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
}

function nextRunMs(now = new Date()) {
  const p = sgtParts(now);
  let candidate = Date.UTC(p.year, p.month, p.date, 8, 0, 0, 0) - SGT_OFFSET_MS;
  if (candidate <= now.getTime()) candidate += ONE_DAY_MS;

  while (true) {
    const day = sgtParts(new Date(candidate)).day;
    if (day >= 2 && day <= 6) return candidate;
    candidate += ONE_DAY_MS;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (process.argv.includes('--status')) {
  const pid = existsSync(PID_FILE) ? Number(readFileSync(PID_FILE, 'utf8')) : null;
  const next = new Date(nextRunMs()).toISOString();
  console.log(JSON.stringify({ pid, running: Boolean(pid && pidAlive(pid)), nextRunAt: next }, null, 2));
  process.exit(0);
}

if (process.argv.includes('--stop')) {
  const pid = existsSync(PID_FILE) ? Number(readFileSync(PID_FILE, 'utf8')) : null;
  if (pid && pidAlive(pid)) process.kill(pid, 'SIGTERM');
  if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  appendLog(`stopped pid=${pid || ''}`);
  process.exit(0);
}

mkdirSync(dirname(PID_FILE), { recursive: true });
if (existsSync(PID_FILE)) {
  const pid = Number(readFileSync(PID_FILE, 'utf8'));
  if (pid && pidAlive(pid)) {
    console.error(`scheduler already running pid=${pid}`);
    process.exit(0);
  }
}

writeFileSync(PID_FILE, `${process.pid}\n`);
appendLog(`started pid=${process.pid}`);

process.on('SIGTERM', () => {
  appendLog('received SIGTERM');
  if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  process.exit(0);
});

while (true) {
  const runAt = nextRunMs();
  appendLog(`next run ${new Date(runAt).toISOString()}`);
  await sleep(Math.max(0, runAt - Date.now()));

  appendLog('running sender');
  const result = spawnSync('node', [SEND_SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    timeout: 180_000
  });

  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  appendLog(`sender exit=${result.status} stdout=${stdout.replace(/\n/g, '\\n')} stderr=${stderr.replace(/\n/g, '\\n')}`);
}
