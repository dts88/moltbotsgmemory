#!/usr/bin/env node
/**
 * 新加坡 + 富查伊拉 周度成品油库存合并报告
 * 数据来源: Platts News Insights API（标题）+ Enterprise Singapore / FOIZ
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CREDS_FILE = join(WORKSPACE, '.config/spglobal/credentials.json');
const APPKEY = 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN';
const API_BASE = 'https://api.platts.com/news-insights/v1';
const FOIZ_API = 'https://fujairah.platts.com/fujairah/rest/public/latest';

function loadToken() {
  const c = JSON.parse(readFileSync(CREDS_FILE, 'utf8'));
  return c.access_token;
}

async function searchLatest(token, q, filter) {
  const url = `${API_BASE}/search/story?q=${encodeURIComponent(q)}&pageSize=10&sort=updatedDate:desc`;
  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token, 'appkey': APPKEY },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return (d.results || []).find(r => r.headline && r.headline.includes(filter));
}

async function fetchFoiz() {
  const res = await fetch(FOIZ_API, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`FOIZ API HTTP ${res.status}`);
  const d = await res.json();
  if (!d.success) throw new Error('FOIZ API returned failure');
  return d.data; // { asOfDate, publishTime, light, medium, heavy } in thousands of barrels
}

// 从标题提取数字，例如 "rise 2.8% WOW to 18.44 mil barrels" → { pct: "+2.8", abs: "18.44 mil bbl" }
function parseHeadline(headline) {
  if (!headline) return { pct: null, abs: null };
  // 匹配 "X% WOW to Y mil barrels" 或 "X% to Y mil"
  const m1 = headline.match(/(rise|fall|drop|decline|jump|increase|decrease|up|down)\s+([\d.]+)%/i);
  const m2 = headline.match(/([\d.]+)\s*mil(?:lion)?\s*barrels?/i);
  const m3 = headline.match(/([\d.]+)\s*million\s*barrels?/i);

  let pct = null;
  if (m1) {
    const dir = /fall|drop|decline|down/i.test(m1[1]) ? '-' : '+';
    pct = `${dir}${m1[2]}%`;
  }
  const abs = m2 ? `${m2[1]} MB` : (m3 ? `${m3[1]} MB` : null);
  return { pct, abs };
}

async function run() {
  const token = loadToken();
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Singapore', year: 'numeric', month: 'long', day: 'numeric' });

  // 查新加坡三类库存（用不同关键词区分）
  const [sgLight, sgMiddle, sgFuelOil, foizRaw] = await Promise.all([
    searchLatest(token, 'SINGAPORE DATA light distillate stocks WOW mil barrels', 'SINGAPORE DATA: Light'),
    searchLatest(token, 'middle distillate stocks 6-week barrels Singapore', 'SINGAPORE DATA: Middle'),
    searchLatest(token, 'Singapore fuel oil stockpiles residual barrels Enterprise', 'SINGAPORE DATA: Fuel'),
    fetchFoiz().catch(e => null),
  ]);

  // 解析新加坡标题数字
  const sgLightP = parseHeadline(sgLight?.headline);
  const sgMidP = parseHeadline(sgMiddle?.headline);
  const sgFOP = parseHeadline(sgFuelOil?.headline);

  // 提取数据日期
  const sgDate = sgLight?.updatedDate?.slice(0, 10) || sgFuelOil?.updatedDate?.slice(0, 10) || '—';

  // FOIZ 直接 API 数据（单位：千桶 → MB）
  const foizDate = foizRaw?.asOfDate || '—';
  const foizTotal = foizRaw ? ((foizRaw.light + foizRaw.medium + foizRaw.heavy) / 1000).toFixed(3) : null;
  const foizLight = foizRaw ? (foizRaw.light / 1000).toFixed(3) : null;
  const foizMedium = foizRaw ? (foizRaw.medium / 1000).toFixed(3) : null;
  const foizHeavy = foizRaw ? (foizRaw.heavy / 1000).toFixed(3) : null;

  // 格式化行
  const trendMap = {
    'high': '高', 'low': '低', 'week': '周',
    'near record low': '接近历史低位', 'record low': '历史低位', 'record high': '历史高位',
  };
  function trendZH(s) {
    // "10-week high" → "10周高点"
    return s.replace(/(\d+)-week (high|low)/gi, (_, n, hl) => `${n}周${hl==='high'?'高点':'低位'}`)
            .replace(/near record low/i, '接近历史低位')
            .replace(/record low/i, '历史低位');
  }

  function fmt(label, p, headline) {
    if (!headline) return `• ${label}: 数据待更新`;
    if (p.abs) {
      const pctStr = p.pct ? ` (${p.pct} WoW)` : '';
      const trendM = headline.match(/(\d+-week (?:high|low)|near record low|record low)/i);
      const trendNote = trendM ? ` — ${trendZH(trendM[0])}` : '';
      return `• ${label}: ${p.abs}${pctStr}${trendNote}`;
    }
    // 无绝对数字：提取 pct + 简短趋势描述
    const pctStr = p.pct ? ` (${p.pct} WoW)` : '';
    const trendM = headline.match(/(\d+-week (?:high|low)|near record low|record low)/i);
    if (trendM) return `• ${label}: ${trendZH(trendM[0])}${pctStr}`;
    const desc = headline.split(':')[1]?.trim()?.replace(/\s+/g,' ')?.slice(0, 50) || '';
    return `• ${label}: ${desc}${pctStr}`;
  }

  const lines = [
    `📦 成品油库存周报`,
    ``,
    `🇸🇬 新加坡（截至 ${sgDate}）`,
    fmt('Light Distillates（轻馏分）', sgLightP, sgLight?.headline),
    fmt('Middle Distillates（中间馏分）', sgMidP, sgMiddle?.headline),
    fmt('Fuel Oil（燃料油）', sgFOP, sgFuelOil?.headline),
    ``,
    `🇦🇪 富查伊拉 FOIZ（截至 ${foizDate}）`,
    foizRaw
      ? `• 总库存：${foizTotal} MB`
      : `• 总库存：数据待更新`,
    foizRaw
      ? `  - Light Distillates：${foizLight} MB`
      : '',
    foizRaw
      ? `  - Middle Distillates：${foizMedium} MB`
      : '',
    foizRaw
      ? `  - Heavy Distillates：${foizHeavy} MB`
      : '',
    ``,
    `数据来源: Platts / Enterprise Singapore / fujairah.platts.com`,
  ].filter(l => l !== '');

  // 把原始标题附上以便核查
  const raw = {
    sgLight: sgLight?.headline,
    sgMiddle: sgMiddle?.headline,
    sgFuelOil: sgFuelOil?.headline,
    foizRaw,
  };

  console.log(JSON.stringify({
    status: 'ok',
    message: lines.join('\n'),
    raw,
    date: now.toISOString(),
  }));
}

await run();
