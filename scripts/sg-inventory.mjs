#!/usr/bin/env node
/**
 * 新加坡成品油库存周报
 * 数据来源: Platts News Insights API（标题含数字）
 * 发布时间: 每周四（Enterprise Singapore 数据）
 * 
 * 覆盖三类库存:
 *   Light Distillates  - 搜索 "SINGAPORE DATA: Light distillate stocks"
 *   Middle Distillates - 搜索 "SINGAPORE DATA: Middle distillate stocks"
 *   Fuel Oil/Residual  - 搜索 "SINGAPORE DATA: Fuel oil stockpiles"
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDS_FILE = join(__dirname, '..', '.config/spglobal/credentials.json');
const APPKEY = 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN';
const API_BASE = 'https://api.platts.com/news-insights/v1';

function loadToken() {
  return JSON.parse(readFileSync(CREDS_FILE, 'utf8')).access_token;
}

async function searchLatest(token, q, filterFn) {
  const url = `${API_BASE}/search/story?q=${encodeURIComponent(q)}&pageSize=5&sort=updatedDate:desc`;
  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token, 'appkey': APPKEY },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`Platts API HTTP ${res.status}`);
  const d = await res.json();
  return (d.results || []).find(r => r.headline && filterFn(r.headline));
}

// 从标题提取数字：e.g. "rise 2.8% WOW to 18.44 mil barrels"
function parseHeadline(headline) {
  if (!headline) return { pct: null, abs: null };
  const m1 = headline.match(/(rise|fall|drop|decline|jump|up|down)\s+([\d.]+)%/i);
  const m2 = headline.match(/([\d.]+)\s*mil(?:lion)?\s*barrels?/i);
  let pct = null;
  if (m1) {
    const neg = /fall|drop|decline|down/i.test(m1[1]);
    pct = (neg ? '-' : '+') + m1[2] + '%';
  }
  const abs = m2 ? `${m2[1]} MB` : null;
  return { pct, abs };
}

function trendZH(headline) {
  const m = headline?.match(/(\d+)-week (high|low)|near record low|record low/i);
  if (!m) return '';
  return m[0]
    .replace(/(\d+)-week high/i, (_, n) => `${n}周高点`)
    .replace(/(\d+)-week low/i, (_, n) => `${n}周低位`)
    .replace(/near record low/i, '接近历史低位')
    .replace(/record low/i, '历史低位');
}

function fmtLine(label, p, headline) {
  if (!headline) return `  ${label}: 数据待更新`;
  const trend = trendZH(headline);
  if (p.abs) {
    const pctStr = p.pct ? ` (${p.pct} WoW)` : '';
    const trendStr = trend ? ` — ${trend}` : '';
    return `  ${label}: ${p.abs}${pctStr}${trendStr}`;
  }
  // 无绝对数字
  if (trend) {
    const pctStr = p.pct ? ` (${p.pct} WoW)` : '';
    return `  ${label}: ${trend}${pctStr}`;
  }
  const desc = headline.split(':')[1]?.trim()?.slice(0, 50) || '';
  return `  ${label}: ${desc}`;
}

async function run() {
  const token = loadToken();

  const [sgLight, sgMiddle, sgFuelOil] = await Promise.all([
    searchLatest(token, 'SINGAPORE DATA light distillate stocks WOW mil barrels',
      h => h.startsWith('SINGAPORE DATA: Light')),
    searchLatest(token, 'Singapore middle distillates 6-week barrels',
      h => h.startsWith('SINGAPORE DATA: Middle')),
    searchLatest(token, 'Singapore fuel oil stockpiles residual barrels',
      h => h.startsWith('SINGAPORE DATA: Fuel')),
  ]);

  const sgDate = sgLight?.updatedDate?.slice(0, 10)
    || sgMiddle?.updatedDate?.slice(0, 10)
    || sgFuelOil?.updatedDate?.slice(0, 10)
    || '—';

  const lines = [
    `📦 新加坡成品油库存周报`,
    `数据截至: ${sgDate}（Enterprise Singapore）`,
    ``,
    fmtLine('Light Distillates（轻馏分）', parseHeadline(sgLight?.headline), sgLight?.headline),
    fmtLine('Middle Distillates（中间馏分）', parseHeadline(sgMiddle?.headline), sgMiddle?.headline),
    fmtLine('Fuel Oil / Residual（燃料油）', parseHeadline(sgFuelOil?.headline), sgFuelOil?.headline),
    ``,
    `数据来源: Platts / Enterprise Singapore`,
  ];

  console.log(JSON.stringify({
    status: 'ok',
    date: sgDate,
    message: lines.join('\n'),
    raw: {
      sgLight: sgLight?.headline,
      sgMiddle: sgMiddle?.headline,
      sgFuelOil: sgFuelOil?.headline,
    }
  }));
}

await run();
