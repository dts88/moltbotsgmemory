#!/usr/bin/env node
/**
 * Platts Monitor 的内容推送到 Hchen WhatsApp。
 * 读取主 Platts Monitor 写入的 latest.json，通过 openclaw message send 直发。
 * stdout 输出：成功时输出 NO_REPLY，错误时输出错误信息（供 cron agent 处理）。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '.cache/platts-monitor');
const LATEST_FILE = join(CACHE_DIR, 'latest.json');
const STATE_FILE = join(CACHE_DIR, 'hchen-announce-state.json');
const NO_REPLY = 'NO_REPLY';
const HCHEN_WHATSAPP = '+6596249687';
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function detachedOpenClawEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('OPENCLAW_') && /SESSION|RUN|TRACE|TRANSCRIPT|TOOL|PROMPT|EMBED/i.test(key)) {
      delete env[key];
    }
  }
  return env;
}

function readJsonIfExists(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

function finish(text) {
  process.stdout.write(text || NO_REPLY);
  process.exit(0);
}

try {
  const latest = readJsonIfExists(LATEST_FILE);
  if (!latest || !latest.generatedAt || !latest.body) {
    finish(NO_REPLY);
  }

  // 检查是否已发送过同一版本
  const state = readJsonIfExists(STATE_FILE, {});
  if (state.lastForwardedGeneratedAt === latest.generatedAt) {
    finish(NO_REPLY);
  }

  // 检查时效
  const generatedAtMs = new Date(latest.generatedAt).getTime();
  if (!Number.isFinite(generatedAtMs) || Date.now() - generatedAtMs > MAX_AGE_MS) {
    finish(NO_REPLY);
  }

  // 通过 openclaw CLI 发送到 Hchen 的 WhatsApp
  execFileSync('openclaw', [
    'message', 'send',
    '--channel', 'whatsapp',
    '--target', HCHEN_WHATSAPP,
    '--message', latest.body,
    '--json'
  ], {
    cwd: __dirname,
    encoding: 'utf8',
    env: detachedOpenClawEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000
  });

  // 记录已发送
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({
    ...state,
    lastForwardedGeneratedAt: latest.generatedAt,
    lastForwardedBodyLength: latest.body.length,
    forwardedAt: new Date().toISOString()
  }, null, 2));

  finish(NO_REPLY);
} catch (e) {
  process.stdout.write(`⚠️ Platts 转发 Hchen 失败：${e.message}`);
  process.exit(1);
}
