#!/usr/bin/env node
/**
 * PCAAT00 daily to Hchen — FIXED FORMAT
 * ⚠️ 注意：这个脚本的 stdout 就是最终发送给 HChen 的完整消息。
 * isolated agent 必须原样输出 stdout，不得添加任何格式化、emoji、注释、或额外信息。
 * 如果 agent 做了任何修改（包括添加其他代码信息），就是 bug。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getPlattsAccessToken } from './platts-auth.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SD = join(__dirname, '..', '.cache/pcaat00');
const SF = join(SD, 'state.json');
const APPKEY = 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN';
const NO_REPLY = 'NO_REPLY';
const HCHEN_WHATSAPP = '+6596249687';

function detachedOpenClawEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('OPENCLAW_') && /SESSION|RUN|TRACE|TRANSCRIPT|TOOL|PROMPT|EMBED/i.test(key)) {
      delete env[key];
    }
  }
  return env;
}

function byBate(r) {
  const m = new Map();
  for (const i of r?.data || []) {
    const b = String(i?.bate || '').toLowerCase();
    if (b) m.set(b, i);
  }
  return m;
}

function fmt(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : null;
}

function parseDate(v) {
  if (!v) return null;
  const t = String(v);
  const iso = t.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function dStr(d, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function tStr(d, tz) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

async function main() {
  try {
    const sendWhatsApp = process.argv.includes('--send-whatsapp');
    const token = await getPlattsAccessToken({ quiet: true });
    const url = `https://api.platts.com/market-data/v3/value/current/symbol?${new URLSearchParams({ filter: 'symbol:"PCAAT00"' })}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, appkey: APPKEY } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const result = payload?.results?.find(r => r?.symbol === 'PCAAT00') || payload?.results?.[0];
    if (!result) throw new Error('No PCAAT00 result');

    const b = byBate(result);
    const c = b.get('c'), h = b.get('h'), l = b.get('l');
    if (!c || !h || !l) throw new Error('Missing bate values');

    const cf = fmt(c.value), hf = fmt(h.value), lf = fmt(l.value);
    if (!cf || !hf || !lf) throw new Error('Non-numeric values');

    const modDate = parseDate(c.modDate || h.modDate || l.modDate);
    if (!modDate) throw new Error('No usable date');

    const today = dStr(new Date(), 'Asia/Singapore');
    if (dStr(modDate, 'Asia/Singapore') !== today) {
      process.stdout.write(NO_REPLY);
      return;
    }

    const rawMod = c.modDate || h.modDate || l.modDate;
    // dedup by modDate
    let state = {};
    try { state = JSON.parse(readFileSync(SF, 'utf8')); } catch {}
    if (state.mod === rawMod) { process.stdout.write(NO_REPLY); return; }

    const utcTime = tStr(modDate, 'UTC');
    const sgtTime = tStr(modDate, 'Asia/Singapore');

    const msg = [
      `📊 Platts Dubai Assessment (PCAAT00) — ${today}`,
      '',
      `收盘价： $${cf}/bbl`,
      `最高： $${hf}`,
      `最低： $${lf}`,
      `发布时间： ${utcTime} UTC / ${sgtTime} SGT`
    ].join('\n');

    if (sendWhatsApp) {
      execFileSync('openclaw', [
        'message',
        'send',
        '--channel',
        'whatsapp',
        '--target',
        HCHEN_WHATSAPP,
        '--message',
        msg,
        '--json'
      ], {
        cwd: join(__dirname, '..'),
        encoding: 'utf8',
        env: detachedOpenClawEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000
      });
    }

    mkdirSync(SD, { recursive: true });
    writeFileSync(SF, JSON.stringify({
      mod: rawMod,
      updatedAt: new Date().toISOString(),
      delivery: sendWhatsApp ? {
        channel: 'whatsapp',
        to: HCHEN_WHATSAPP,
        sentAt: new Date().toISOString()
      } : undefined
    }, null, 2));

    if (sendWhatsApp) {
      process.stdout.write('SENT');
      return;
    }

    process.stdout.write(msg);
  } catch (e) {
    process.stdout.write(`⚠️ PCAAT00 查询失败：${e.message}`);
  }
}

main().catch(e => { process.stdout.write(`⚠️ PCAAT00 异常：${e.message}`); });
