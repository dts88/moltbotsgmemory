#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PID_FILE = join(ROOT, '.config/crude-daily-snippet-weixin-scheduler.pid');
const LOG_FILE = join(ROOT, 'logs/crude-daily-snippet-weixin-scheduler.log');
const WRAPPER = join(ROOT, 'scripts/crude-daily-snippet-weixin-cron.sh');

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  process.stdout.write(line);
}

function sgtParts(date) {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    ms: shifted.getUTCMilliseconds()
  };
}

function utcForSgtDate(parts, hour, minute = 0) {
  return new Date(Date.UTC(parts.year, parts.month, parts.day, hour - 8, minute, 0, 0));
}

function nextRun(from = new Date()) {
  const parts = sgtParts(from);
  let candidate = utcForSgtDate(parts, 8);
  let weekday = parts.weekday;

  if (candidate <= from) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
    weekday = (weekday + 1) % 7;
  }

  while (weekday === 0 || weekday === 1) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
    weekday = (weekday + 1) % 7;
  }

  return candidate;
}

function runOnce() {
  return new Promise(resolve => {
    log(`running ${WRAPPER}`);
    const child = spawn(WRAPPER, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', chunk => process.stdout.write(chunk));
    child.stderr.on('data', chunk => process.stderr.write(chunk));
    child.on('close', code => {
      log(`wrapper exited code=${code}`);
      resolve();
    });
  });
}

async function loop() {
  mkdirSync(join(ROOT, '.config'), { recursive: true });
  mkdirSync(join(ROOT, 'logs'), { recursive: true });
  writeFileSync(PID_FILE, `${process.pid}\n`);

  for (;;) {
    const target = nextRun();
    const delay = target.getTime() - Date.now();
    log(`next run at ${target.toISOString()} (08:00 SGT)`);
    await new Promise(resolve => setTimeout(resolve, delay));
    await runOnce();
  }
}

if (process.argv.includes('--status')) {
  if (!existsSync(PID_FILE)) {
    console.log('not running: no pid file');
    process.exit(1);
  }
  const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
  try {
    process.kill(pid, 0);
    console.log(`running: pid ${pid}`);
  } catch {
    console.log(`not running: stale pid ${pid}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes('--run-once')) {
  await runOnce();
  process.exit(0);
}

loop().catch(error => {
  console.error(`[scheduler] ${error.stack || error.message}`);
  process.exit(1);
});
