#!/usr/bin/env node
/**
 * Polymarket single-market monitor
 * Usage: node scripts/polymarket-single-market-monitor.mjs <market-slug> [display-name]
 * Outputs JSON with `message` for cron agent payloads.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CONFIG_DIR = join(WORKSPACE, '.config/polymarket');
const STATE_FILE = join(CONFIG_DIR, 'single-market-state.json');
const API_BASE = 'https://gamma-api.polymarket.com';

const slug = process.argv[2] || 'strait-of-hormuz-traffic-returns-to-normal-by-may-15';
const displayName = process.argv.slice(3).join(' ') || null;

if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });

function loadState() {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {}
  return { markets: {} };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function formatVol(v) {
  const n = Number(v || 0);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return 'n/a';
  return `${(Number(n) * 100).toFixed(digits)}%`;
}

async function fetchMarketBySlug(slug) {
  const url = `${API_BASE}/markets?slug=${encodeURIComponent(slug)}&limit=1`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`Polymarket API ${res.status}`);
  const data = await res.json();
  const market = Array.isArray(data) ? data[0] : data?.[0];
  if (!market) throw new Error(`Market not found: ${slug}`);
  return market;
}

const now = new Date();
const nowSGT = now.toLocaleString('en-SG', {
  timeZone: 'Asia/Singapore',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit'
});

const state = loadState();
const market = await fetchMarketBySlug(slug);
const prices = JSON.parse(market.outcomePrices || '[null,null]').map(Number);
const yes = prices[0];
const no = prices[1];
const prev = state.markets[slug];
const change = prev?.yes !== undefined ? yes - prev.yes : null;
const dayChange = Number(market.oneDayPriceChange || 0);
const weekChange = Number(market.oneWeekPriceChange || 0);
const bid = market.bestBid !== undefined && market.bestBid !== null ? Number(market.bestBid) : null;
const ask = market.bestAsk !== undefined && market.bestAsk !== null ? Number(market.bestAsk) : null;
const spread = bid !== null && ask !== null ? ask - bid : null;

state.markets[slug] = {
  yes,
  no,
  volume24h: Number(market.volume24hr || 0),
  liquidity: Number(market.liquidity || market.liquidityNum || 0),
  updatedAt: now.toISOString()
};
state.lastCheck = now.toISOString();
saveState(state);

const title = displayName || market.question || market.title || slug;
const changeStr = change === null ? '首次记录' : `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}pt vs上次`;
const arrow = change > 0 ? '🔺' : change < 0 ? '🔻' : '';

const message = [
  `🌊 Polymarket 监控：${title}`,
  `${nowSGT} SGT`,
  '',
  `Yes: ${pct(yes)} ${arrow}`.trim(),
  `No: ${pct(no)}`,
  `变化: ${changeStr}`,
  `24h: ${dayChange >= 0 ? '+' : ''}${(dayChange * 100).toFixed(1)}pt；7d: ${weekChange >= 0 ? '+' : ''}${(weekChange * 100).toFixed(1)}pt`,
  `24h成交量: ${formatVol(market.volume24hr)}`,
  `总成交量: ${formatVol(market.volume || market.volumeNum)}`,
  `流动性: ${formatVol(market.liquidity || market.liquidityNum)}`,
  spread !== null ? `Bid/Ask: ${pct(bid)} / ${pct(ask)}（spread ${(spread * 100).toFixed(1)}pt）` : null
].filter(Boolean).join('\n');

console.log(JSON.stringify({
  status: 'OK',
  timestamp: now.toISOString(),
  slug,
  question: market.question || market.title,
  yes,
  no,
  change,
  volume24h: Number(market.volume24hr || 0),
  liquidity: Number(market.liquidity || market.liquidityNum || 0),
  message
}, null, 2));
