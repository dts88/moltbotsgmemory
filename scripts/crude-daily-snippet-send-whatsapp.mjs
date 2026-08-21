#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATE_FILE = join(ROOT, '.config/crude-daily-snippet-whatsapp-state.json');
const LOG_FILE = join(ROOT, 'logs/crude-daily-snippet-direct.log');
const TARGET = '+6592716786';
const NO_REPLY = 'NO_REPLY';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const ignoreState = args.has('--ignore-state');
const forceSend = args.has('--force-send') || process.env.FORCE_SEND === '1';

function detachedOpenClawEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('OPENCLAW_') && /SESSION|RUN|TRACE|TRANSCRIPT|TOOL|PROMPT|EMBED/i.test(key)) {
      delete env[key];
    }
  }
  return env;
}

function sgtDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

function readJson(path, fallback = {}) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function appendLog(text) {
  mkdirSync(dirname(LOG_FILE), { recursive: true });
  writeFileSync(LOG_FILE, `[${new Date().toISOString()}] ${text}\n`, { flag: 'a' });
}

function finish(text) {
  process.stdout.write(text);
  appendLog(text.replace(/\n/g, '\\n'));
}

try {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  const deliveryDate = sgtDate();
  const state = readJson(STATE_FILE);

  if (!ignoreState && !forceSend && state.lastDeliveryDate === deliveryDate) {
    finish(`${NO_REPLY} already sent for ${deliveryDate}`);
    process.exit(0);
  }

  const message = execFileSync('node', ['skills/crude-daily-snippet/scripts/generate.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000
  }).trimEnd();

  if (!message) throw new Error('generator returned empty output');

  if (!dryRun) {
    execFileSync('openclaw', [
      'message',
      'send',
      '--channel',
      'whatsapp',
      '--target',
      TARGET,
      '--message',
      message,
      '--json'
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      env: detachedOpenClawEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000
    });

    writeFileSync(STATE_FILE, `${JSON.stringify({
      lastDeliveryDate: deliveryDate,
      lastSentAt: new Date().toISOString(),
      lastMessageSha256: createHash('sha256').update(message).digest('hex'),
      firstLine: message.split(/\r?\n/, 1)[0] || '',
      delivery: {
        channel: 'whatsapp',
        to: TARGET,
        mode: 'direct-script'
      }
    }, null, 2)}\n`);
  }

  finish(dryRun ? message : 'SENT');
} catch (error) {
  const text = `ERROR: ${error.message}`;
  finish(text);
  process.exit(1);
}
