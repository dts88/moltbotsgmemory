#!/usr/bin/env node
/**
 * Safe Airspace Monitor
 * 从 safeairspace.net 获取最新空域风险警告
 * 追踪新增条目，输出格式化报告
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CONFIG_DIR = join(WORKSPACE, '.config/safeairspace');
const STATE_FILE = join(CONFIG_DIR, 'state.json');
const URL = 'https://safeairspace.net/';

// 中文月份名映射
const MONTH_MAP = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
};

// 风险等级关键词 → emoji
const RISK_EMOJI = {
  'Do Not Fly': '🚫',
  'prohibited': '🚫',
  'should not enter': '⛔',
  'avoid': '⚠️',
  'closed': '🔴',
  'caution': '⚡',
  'exercise caution': '⚡',
  'restricted': '🟡',
};

if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });

function loadState() {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {}
  return { seenHashes: [], lastCheck: null };
}

function saveState(state) {
  // 只保留最近 500 条 hash，避免文件无限增长
  if (state.seenHashes.length > 500) {
    state.seenHashes = state.seenHashes.slice(-500);
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function hashEntry(country, date, text) {
  return createHash('md5').update(`${country}|${date}|${text.slice(0, 100)}`).digest('hex').slice(0, 12);
}

function parseDate(dateStr) {
  // 格式: "16 Mar" 或 "05 Mar"
  const parts = dateStr.trim().split(' ');
  if (parts.length !== 2) return null;
  const day = parseInt(parts[0]);
  const month = MONTH_MAP[parts[1]];
  if (!month) return null;
  const year = new Date().getFullYear();
  return new Date(year, month - 1, day);
}

function getRiskEmoji(text) {
  for (const [kw, emoji] of Object.entries(RISK_EMOJI)) {
    if (text.toLowerCase().includes(kw.toLowerCase())) return emoji;
  }
  return '📋';
}

// 判断是否是中东/霍尔木兹相关区域
const MIDEAST_COUNTRIES = new Set([
  'Iran', 'Iraq', 'Israel', 'Lebanon', 'Syria', 'Yemen', 'Saudi Arabia',
  'UAE', 'United Arab Emirates', 'Qatar', 'Bahrain', 'Kuwait', 'Oman',
  'Jordan', 'Egypt', 'Armenia', 'Azerbaijan', 'Palestine', 'Gaza'
]);

function isMideast(country) {
  return MIDEAST_COUNTRIES.has(country);
}

async function fetchPage() {
  const res = await fetch(URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Moltbot/1.0)' },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseEntries(html) {
  const entries = [];
  
  // 解析 HTML 提取条目
  // 格式: <country>\n <date>\n\n <text>
  // 用正则从 HTML 文本中提取
  
  // 先去除 HTML 标签，得到文本
  const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                   .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                   .replace(/<[^>]+>/g, '\n')
                   .replace(/&amp;/g, '&')
                   .replace(/&lt;/g, '<')
                   .replace(/&gt;/g, '>')
                   .replace(/&nbsp;/g, ' ')
                   .replace(/&#\d+;/g, '');
  
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // 检测日期行（格式: "16 Mar" 或 "05 Mar"）
    const dateMatch = line.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/);
    if (dateMatch && i > 0) {
      // 前一行是国家名
      const country = lines[i - 1];
      const date = line;
      
      // 跳过不像国家名的行
      if (country.length > 0 && country.length < 60 && !country.match(/^\d/) && !country.includes(':')) {
        // 收集后续描述文本（直到遇到下一个国家+日期对）
        let textLines = [];
        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j];
          // 检查是否到了下一个条目（日期行之前的国家名）
          const nextDateMatch = j + 1 < lines.length && 
            lines[j + 1].match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/);
          if (nextDateMatch) break;
          if (nextLine.length > 0) textLines.push(nextLine);
          j++;
          if (textLines.join(' ').length > 500) break; // 够了
        }
        
        const description = textLines.join(' ').trim();
        if (description.length > 20) {
          entries.push({ country, date, description });
        }
        i = j;
        continue;
      }
    }
    i++;
  }
  
  return entries;
}

async function monitor() {
  const state = loadState();
  const now = new Date();
  
  let html;
  try {
    html = await fetchPage();
  } catch (e) {
    console.error(`[SafeAirspace] Fetch error: ${e.message}`);
    console.log(JSON.stringify({ status: 'ERROR', error: e.message }));
    return;
  }
  
  const entries = parseEntries(html);
  
  if (entries.length === 0) {
    console.error('[SafeAirspace] No entries parsed');
    console.log(JSON.stringify({ status: 'NO_DATA' }));
    return;
  }
  
  // 找出新条目（未见过的 hash）
  const newEntries = [];
  const allHashes = [];
  
  for (const entry of entries) {
    const h = hashEntry(entry.country, entry.date, entry.description);
    allHashes.push(h);
    if (!state.seenHashes.includes(h)) {
      newEntries.push({ ...entry, hash: h });
    }
  }
  
  // 更新 state
  state.seenHashes = [...new Set([...state.seenHashes, ...allHashes])];
  state.lastCheck = now.toISOString();
  saveState(state);
  
  // 分类：中东优先
  const mideastNew = newEntries.filter(e => isMideast(e.country));
  const otherNew = newEntries.filter(e => !isMideast(e.country));
  
  // 最近7天内的所有中东条目（不限新旧，用于汇总视图）
  const cutoff7d = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const mideastRecent = entries.filter(e => {
    if (!isMideast(e.country)) return false;
    const d = parseDate(e.date);
    return d && d >= cutoff7d;
  });
  
  const output = {
    status: newEntries.length > 0 ? 'NEW_ALERTS' : 'NO_NEW',
    timestamp: now.toISOString(),
    newCount: newEntries.length,
    newMideast: mideastNew.length,
    newOther: otherNew.length,
    newEntries,
    mideastRecent,   // 最近7天中东条目（含已见过的）
    totalParsed: entries.length,
  };
  
  console.log(JSON.stringify(output, null, 2));
}

await monitor();
