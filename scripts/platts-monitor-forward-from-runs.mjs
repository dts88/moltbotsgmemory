#!/usr/bin/env node
/**
 * Forward the latest delivered main Platts Monitor cron summary.
 *
 * This avoids asking the forwarding agent to call cron tools and reason over large
 * histories. It uses the OpenClaw CLI locally, finds the newest delivered main
 * run with a real summary, de-dupes via state, and prints either that summary or
 * NO_REPLY for OpenClaw delivery.
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CACHE_DIR = join(WORKSPACE, '.cache/platts-monitor');
const STATE_FILE = join(CACHE_DIR, 'hchen-forward-state.json');
const MAIN_JOB_ID = '8cc67dea-36eb-4d2b-955d-04efbdf666ac';
const FORWARD_JOB_ID = 'a8f638e4-6afa-4960-8330-87be18347dab';
const NO_REPLY = 'NO_REPLY';

function readJsonIfExists(path, fallback = {}) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return fallback; }
}

function finish(text) {
  process.stdout.write(text || NO_REPLY);
}

function isRealSummary(summary) {
  if (!summary || typeof summary !== 'string') return false;
  const trimmed = summary.trim();
  if (!trimmed || trimmed === NO_REPLY) return false;
  if (/^🔑\s*Platts Token/.test(trimmed)) return false;
  return /Platts|快报|Heards|Stories|原油|成品油|燃料油|LNG|石脑油|航煤/.test(trimmed);
}

try {
  const raw = execFileSync('openclaw', ['cron', 'runs', '--id', MAIN_JOB_ID, '--limit', '10'], {
    cwd: WORKSPACE,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024
  });

  const data = JSON.parse(raw);
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const latest = entries.find((entry) =>
    entry &&
    entry.action === 'finished' &&
    entry.status === 'ok' &&
    (entry.delivered === true || entry.deliveryStatus === 'delivered') &&
    isRealSummary(entry.summary)
  );

  if (!latest) {
    finish(NO_REPLY);
    process.exit(0);
  }

  // Do not rely on pre-output state for de-dupe: if an agent times out after
  // updating state but before delivery, state would falsely suppress the next
  // attempt. Instead, inspect this forward job's own successful delivery history.
  const ownRaw = execFileSync('openclaw', ['cron', 'runs', '--id', FORWARD_JOB_ID, '--limit', '10'], {
    cwd: WORKSPACE,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024
  });
  const ownData = JSON.parse(ownRaw);
  const ownEntries = Array.isArray(ownData.entries) ? ownData.entries : [];
  const alreadyDelivered = ownEntries.some((entry) =>
    entry &&
    entry.action === 'finished' &&
    entry.status === 'ok' &&
    (entry.delivered === true || entry.deliveryStatus === 'delivered') &&
    entry.summary === latest.summary
  );

  if (alreadyDelivered) {
    finish(NO_REPLY);
    process.exit(0);
  }

  // Best-effort observability only. This is not used for de-dupe.
  mkdirSync(CACHE_DIR, { recursive: true });
  const state = readJsonIfExists(STATE_FILE, {});
  writeFileSync(STATE_FILE, JSON.stringify({
    ...state,
    lastCandidateMainRunTs: latest.ts,
    mainRunAtMs: latest.runAtMs,
    checkedAt: new Date().toISOString()
  }, null, 2));

  finish(latest.summary);
} catch (e) {
  console.error(`[platts-monitor-forward-from-runs] ${e.stack || e.message}`);
  finish(NO_REPLY);
}
