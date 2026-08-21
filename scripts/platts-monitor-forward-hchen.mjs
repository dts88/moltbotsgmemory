#!/usr/bin/env node
/**
 * Forward cached Platts Monitor output to Hchen.
 *
 * This script intentionally does NOT call Platts APIs or an LLM. The main
 * Platts Monitor writes the exact delivered body to latest.json/latest.txt; this
 * script prints that body for OpenClaw delivery and de-dupes by generatedAt.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CACHE_DIR = join(WORKSPACE, '.cache/platts-monitor');
const LATEST_FILE = join(CACHE_DIR, 'latest.json');
const STATE_FILE = join(CACHE_DIR, 'hchen-forward-state.json');

const MAX_AGE_MS = 60 * 60 * 1000; // enough for delayed retries, still same monitor cycle
const NO_REPLY = 'NO_REPLY';

function singaporeDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function readJsonIfExists(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function finish(text) {
  process.stdout.write(text || NO_REPLY);
}

try {
  const latest = readJsonIfExists(LATEST_FILE);
  if (!latest || !latest.generatedAt || !latest.date || !latest.body) {
    finish(NO_REPLY);
    process.exit(0);
  }

  const today = singaporeDateString();
  if (latest.date !== today) {
    finish(NO_REPLY);
    process.exit(0);
  }

  const generatedAtMs = new Date(latest.generatedAt).getTime();
  if (!Number.isFinite(generatedAtMs) || Date.now() - generatedAtMs > MAX_AGE_MS) {
    finish(NO_REPLY);
    process.exit(0);
  }

  const state = readJsonIfExists(STATE_FILE, {});
  if (state.lastForwardedGeneratedAt === latest.generatedAt) {
    finish(NO_REPLY);
    process.exit(0);
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({
    ...state,
    lastForwardedGeneratedAt: latest.generatedAt,
    lastForwardedBodyLength: latest.body.length,
    forwardedAt: new Date().toISOString()
  }, null, 2));

  finish(latest.body);
} catch (e) {
  console.error(`[platts-monitor-forward-hchen] ${e.stack || e.message}`);
  finish(NO_REPLY);
}
