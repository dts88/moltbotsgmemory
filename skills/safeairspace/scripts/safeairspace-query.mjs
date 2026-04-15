#!/usr/bin/env node
/**
 * safeairspace-query.mjs
 * 从 safeairspace.net 查询空域风险信息
 *
 * 用法:
 *   node safeairspace-query.mjs                   # 全部（最新50条）
 *   node safeairspace-query.mjs --region=mideast   # 中东相关国家
 *   node safeairspace-query.mjs --country=Iran     # 指定国家
 *   node safeairspace-query.mjs --days=7           # 最近N天
 *   node safeairspace-query.mjs --new              # 仅首次出现的条目（需 state 文件）
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..', '..', '..');
const STATE_DIR = join(WORKSPACE, '.config/safeairspace');
const STATE_FILE = join(STATE_DIR, 'state.json');

// 解析参数
const args = process.argv.slice(2);
const getArg = (key) => {
  const a = args.find(a => a.startsWith(`--${key}=`));
  return a ? a.split('=').slice(1).join('=') : null;
};
const hasFlag = (key) => args.includes(`--${key}`);

const regionFilter = getArg('region');    // mideast | caucasus | africa | europe | asia
const countryFilter = getArg('country');  // 精确国家名
const daysFilter = parseInt(getArg('days') || '30');
const newOnly = hasFlag('new');
const json = hasFlag('json');

// 中东地区
const REGIONS = {
  mideast: ['Iran', 'Iraq', 'Israel', 'Lebanon', 'Syria', 'Yemen', 'Saudi Arabia',
    'UAE', 'United Arab Emirates', 'Qatar', 'Bahrain', 'Kuwait', 'Oman',
    'Jordan', 'Egypt', 'Palestine', 'Gaza', 'Armenia', 'Azerbaijan'],
  caucasus: ['Armenia', 'Azerbaijan', 'Georgia'],
  africa: ['Libya', 'Sudan', 'South Sudan', 'Mali', 'Somalia', 'Ethiopia', 'Congo DRC', 'Rwanda'],
  europe: ['Ukraine', 'Russia', 'Belarus', 'Moldova'],
  asia: ['Afghanistan', 'Pakistan', 'Myanmar', 'North Korea', 'China'],
};

const MONTH_MAP = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
};

function parseDate(dateStr) {
  const parts = dateStr.trim().split(' ');
  if (parts.length !== 2) return null;
  const day = parseInt(parts[0]);
  const month = MONTH_MAP[parts[1]];
  if (!month) return null;
  return new Date(new Date().getFullYear(), month - 1, day);
}

function hashEntry(country, date, text) {
  return createHash('md5').update(`${country}|${date}|${text.slice(0, 100)}`).digest('hex').slice(0, 12);
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {}
  return { seenHashes: [] };
}

function saveState(state) {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  if (state.seenHashes.length > 500) state.seenHashes = state.seenHashes.slice(-500);
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchPage() {
  const res = await fetch('https://safeairspace.net/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)' },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseEntries(html) {
  const entries = [];
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '');

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const dateMatch = line.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/);
    if (dateMatch && i > 0) {
      const country = lines[i - 1];
      if (country.length > 0 && country.length < 60 && !country.match(/^\d/) && !country.includes(':')) {
        let textLines = [];
        let j = i + 1;
        while (j < lines.length) {
          const nextDateMatch = j + 1 < lines.length &&
            lines[j + 1].match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/);
          if (nextDateMatch) break;
          if (lines[j].length > 0) textLines.push(lines[j]);
          j++;
          if (textLines.join(' ').length > 500) break;
        }
        const description = textLines.join(' ').trim();
        if (description.length > 20) entries.push({ country, date: line, description });
        i = j;
        continue;
      }
    }
    i++;
  }
  return entries;
}

function getRiskLevel(text) {
  const t = text.toLowerCase();
  if (t.includes('do not fly') || t.includes('prohibited')) return { level: 'PROHIBITED', emoji: '🚫' };
  if (t.includes('should not enter') || t.includes('not enter') || t.includes('closed')) return { level: 'AVOID', emoji: '⛔' };
  if (t.includes('avoid')) return { level: 'AVOID', emoji: '⚠️' };
  if (t.includes('caution') || t.includes('advisory')) return { level: 'CAUTION', emoji: '⚡' };
  return { level: 'NOTICE', emoji: '📋' };
}

// 主逻辑
let html;
try {
  html = await fetchPage();
} catch (e) {
  console.error(`[SafeAirspace] 抓取失败: ${e.message}`);
  process.exit(1);
}

const allEntries = parseEntries(html);
const now = new Date();
const cutoff = new Date(now.getTime() - daysFilter * 24 * 3600 * 1000);

// 过滤
let filtered = allEntries.filter(e => {
  const d = parseDate(e.date);
  if (!d || d < cutoff) return false;
  if (countryFilter) return e.country.toLowerCase().includes(countryFilter.toLowerCase());
  if (regionFilter) {
    const regionCountries = REGIONS[regionFilter.toLowerCase()] || [];
    return regionCountries.some(c => e.country.toLowerCase() === c.toLowerCase());
  }
  return true;
});

// new-only 模式
const state = loadState();
let isNew = {};
if (newOnly) {
  filtered = filtered.filter(e => {
    const h = hashEntry(e.country, e.date, e.description);
    return !state.seenHashes.includes(h);
  });
}

// 更新 seen hashes
const newHashes = filtered.map(e => hashEntry(e.country, e.date, e.description));
state.seenHashes = [...new Set([...state.seenHashes, ...newHashes])];
saveState(state);

if (json) {
  console.log(JSON.stringify({ entries: filtered, total: filtered.length, allTotal: allEntries.length }));
  process.exit(0);
}

// 文本输出
const label = countryFilter ? countryFilter :
  regionFilter ? `${regionFilter} 地区` : `全部地区 (最近${daysFilter}天)`;

console.log(`✈️ Safe Airspace 空域风险查询`);
console.log(`范围: ${label} | 结果: ${filtered.length}条 / 共${allEntries.length}条`);
console.log(`来源: https://safeairspace.net/`);
console.log('');

if (filtered.length === 0) {
  console.log('（无符合条件的记录）');
  process.exit(0);
}

// 按国家分组
const byCountry = {};
for (const e of filtered) {
  if (!byCountry[e.country]) byCountry[e.country] = [];
  byCountry[e.country].push(e);
}

for (const [country, entries] of Object.entries(byCountry)) {
  const { emoji } = getRiskLevel(entries[0].description);
  console.log(`${emoji} ${country}`);
  for (const e of entries) {
    console.log(`  [${e.date}] ${e.description}`);
  }
  console.log('');
}
