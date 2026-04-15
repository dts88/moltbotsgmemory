#!/usr/bin/env node
/**
 * 富查伊拉 FOIZ 库存 + 船燃销售周报
 * 数据来源: fujairah.platts.com 公开 API（无需认证）
 * 
 * API:
 *   GET https://fujairah.platts.com/fujairah/rest/public/latest
 *     → { asOfDate, publishTime, light, medium, heavy } 单位：千桶
 *   GET https://fujairah.platts.com/fujairah/rest/public/latestBunker
 *     → { asOfDate, symbol1(vessels), symbol2(VLSFO), symbol3(HSFO),
 *           symbol4(LSMGO), symbol5(Lubricants), symbol6(MGO) } 单位：公吨
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const STATE_FILE = join(WORKSPACE, '.config/foiz/history.json');
const STATE_DIR = join(WORKSPACE, '.config/foiz');

if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

const INVENTORY_API  = 'https://fujairah.platts.com/fujairah/rest/public/latest';
const BUNKER_API     = 'https://fujairah.platts.com/fujairah/rest/public/latestBunker';
const COMMENTARY_API = 'https://fujairah.platts.com/fujairah/rest/public/commentary';
const PLATTS_CREDS   = join(WORKSPACE, '.config/spglobal/credentials.json');
const PLATTS_APPKEY  = 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN';

// Bunker 字段映射
const BUNKER_FIELDS = {
  symbol1: { name: 'Total Vessels Called', unit: '艘' },
  symbol2: { name: 'VLSFO 380cst 低硫燃料油', unit: 'mt' },
  symbol3: { name: 'HSFO 380cst 高硫燃料油', unit: 'mt' },
  symbol4: { name: 'Low Sulfur MGO', unit: 'mt' },
  symbol5: { name: 'Lubricants（润滑油）', unit: 'mt' },
  symbol6: { name: 'Marine Gasoil（船用柴油）', unit: 'mt' },
};

function loadHistory() {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {}
  return { inventory: [], bunker: [] };
}

function saveHistory(h) {
  writeFileSync(STATE_FILE, JSON.stringify(h, null, 2));
}

function mb(kb) { return (kb / 1000).toFixed(3); }

function pct(current, prev) {
  if (prev == null || prev === 0) return null;
  return ((current - prev) / prev * 100).toFixed(1);
}

function fmtPct(p) {
  if (p == null) return '';
  return ` (${+p > 0 ? '+' : ''}${p}% WoW)`;
}

function fmtNum(n) {
  return n?.toLocaleString('en-US') ?? '—';
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const d = await res.json();
  if (!d.success) throw new Error('API failure: ' + d.message);
  return d.data;
}

async function fetchCommentary() {
  try {
    const res = await fetch(COMMENTARY_API, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d.success) return null;
    // Strip HTML tags
    const text = (d.data || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return text || null;
  } catch { return null; }
}

async function translateWithPlatts(text) {
  // 使用 Platts 已有 token + Claude API (通过 OpenClaw 内部) 翻译
  // 实际上直接在脚本里用 fetch 调用本地 LLM 或返回原文让调用方翻译
  // 这里返回原文，由 cron agent 负责翻译
  return text;
}

async function run() {
  const [inv, bunk, commentary] = await Promise.all([
    fetchJson(INVENTORY_API),
    fetchJson(BUNKER_API),
    fetchCommentary(),
  ]);

  const history = loadHistory();

  // === 库存 WoW ===
  const prevInv = history.inventory.at(-1);
  const invTotal = inv.light + inv.medium + inv.heavy;
  const prevTotal = prevInv ? prevInv.light + prevInv.medium + prevInv.heavy : null;

  // 存档（按 asOfDate 去重）
  if (!prevInv || prevInv.asOfDate !== inv.asOfDate) {
    history.inventory.push({ ...inv, savedAt: new Date().toISOString() });
    // 保留最近 52 周
    if (history.inventory.length > 52) history.inventory = history.inventory.slice(-52);
  }

  // === Bunker WoW ===
  const prevBunk = history.bunker.at(-1);
  if (!prevBunk || prevBunk.asOfDate !== bunk.asOfDate) {
    history.bunker.push({ ...bunk, savedAt: new Date().toISOString() });
    if (history.bunker.length > 52) history.bunker = history.bunker.slice(-52);
  }

  saveHistory(history);

  // === 格式化报告 ===
  const invLines = [
    `📦 富查伊拉 FOIZ 库存周报`,
    `数据截至: ${inv.asOfDate}  |  发布: ${inv.publishTime?.split(' ').slice(0,4).join(' ')}`,
    ``,
    `总库存: ${mb(invTotal)} MB${fmtPct(pct(invTotal, prevTotal))}`,
    ``,
    `  Light Distillates（轻馏分）: ${mb(inv.light)} MB${fmtPct(pct(inv.light, prevInv?.light))}`,
    `  Middle Distillates（中间馏分）: ${mb(inv.medium)} MB${fmtPct(pct(inv.medium, prevInv?.medium))}`,
    `  Heavy Distillates（重质馏分/残渣油）: ${mb(inv.heavy)} MB${fmtPct(pct(inv.heavy, prevInv?.heavy))}`,
  ];

  const bunkTotal = (bunk.symbol2 || 0) + (bunk.symbol3 || 0) + (bunk.symbol4 || 0) + (bunk.symbol6 || 0);
  const prevBunkTotal = prevBunk
    ? (prevBunk.symbol2 || 0) + (prevBunk.symbol3 || 0) + (prevBunk.symbol4 || 0) + (prevBunk.symbol6 || 0)
    : null;

  const bunkLines = [
    ``,
    `⛽ 富查伊拉船燃销售（月度，截至 ${bunk.asOfDate}）`,
    ``,
    `进港船数: ${fmtNum(bunk.symbol1)} 艘${fmtPct(pct(bunk.symbol1, prevBunk?.symbol1))}`,
    `燃油销售合计: ${fmtNum(bunkTotal)} mt${fmtPct(pct(bunkTotal, prevBunkTotal))}`,
    `  VLSFO（低硫重燃）: ${fmtNum(bunk.symbol2)} mt`,
    `  HSFO（高硫重燃）: ${fmtNum(bunk.symbol3)} mt`,
    `  Low Sulfur MGO: ${fmtNum(bunk.symbol4)} mt`,
    `  Marine Gasoil: ${fmtNum(bunk.symbol6)} mt`,
    `  Lubricants: ${fmtNum(bunk.symbol5)} mt`,
    ``,
    `数据来源: fujairah.platts.com (FOIZ/S&P Global)`,
  ];

  const message = [...invLines, ...bunkLines].join('\n');

  console.log(JSON.stringify({
    status: 'ok',
    invDate: inv.asOfDate,
    bunkDate: bunk.asOfDate,
    message,
    commentary,  // 英文原文，由调用方翻译后附上
    historyCount: { inventory: history.inventory.length, bunker: history.bunker.length },
  }));
}

await run();
