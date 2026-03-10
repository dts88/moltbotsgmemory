#!/usr/bin/env node
/**
 * Polymarket Geopolitical Monitor
 * 跟踪政治/地缘/战争相关市场概率
 * 
 * 输出详细数据：概率、交易量、流动性、买卖价差、变化趋势
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CONFIG_DIR = join(WORKSPACE, '.config/polymarket');
const STATE_FILE = join(CONFIG_DIR, 'state.json');
const API_BASE = 'https://gamma-api.polymarket.com';

// 确保目录存在
if (!existsSync(CONFIG_DIR)) {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

// 要监控的市场
const MARKETS = [
  { slug: 'us-strikes-iran-by', emoji: '🚨', name: 'US Strikes Iran', priority: 1 },
  { slug: 'will-iran-close-the-strait-of-hormuz-by-2027', emoji: '🌊', name: 'Iran Closes Hormuz', priority: 1 },
  { slug: 'israel-x-iran-ceasefire-broken-by', emoji: '🇮🇱🇮🇷', name: 'Israel-Iran Ceasefire', priority: 1 },
  { slug: 'russia-x-ukraine-ceasefire-by-march-31-2026', emoji: '🇷🇺🇺🇦', name: 'Russia-Ukraine Ceasefire', priority: 2 },
  { slug: 'russia-x-ukraine-ceasefire-by-end-of-2026', emoji: '🇷🇺🇺🇦', name: 'Russia-Ukraine Ceasefire 2026', priority: 2 },
  { slug: 'us-x-russia-military-clash-by', emoji: '🇺🇸🇷🇺', name: 'US-Russia Clash', priority: 2 },
  { slug: 'india-strike-on-pakistan-by', emoji: '🇮🇳🇵🇰', name: 'India-Pakistan', priority: 3 },
  { slug: 'will-china-blockade-taiwan-by-june-30', emoji: '🇨🇳🇹🇼', name: 'China Blockade Taiwan', priority: 3 },
  { slug: 'will-china-invade-taiwan-by-end-of-2026', emoji: '🇨🇳🇹🇼', name: 'China Invade Taiwan', priority: 3 },
  { slug: 'nuclear-weapon-detonation-by', emoji: '☢️', name: 'Nuclear Detonation', priority: 3 },
];

// 阈值
const SIGNIFICANT_PROB_CHANGE = 3;    // 概率变化 3% 视为显著
const SIGNIFICANT_VOL_CHANGE = 50;    // 交易量变化 50% 视为显著

function formatVolume(vol) {
  if (vol >= 1e9) return `$${(vol / 1e9).toFixed(1)}B`;
  if (vol >= 1e6) return `$${(vol / 1e6).toFixed(1)}M`;
  if (vol >= 1e3) return `$${(vol / 1e3).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('[State] Error loading:', e.message);
  }
  return { lastCheck: null, markets: {} };
}

function saveState(state) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[State] Error saving:', e.message);
  }
}

async function fetchEvent(slug) {
  try {
    const res = await fetch(`${API_BASE}/events?slug=${slug}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0] || null;
  } catch (e) {
    console.error(`[Fetch] ${slug}: ${e.message}`);
    return null;
  }
}

function parseMarkets(event) {
  if (!event?.markets) return [];
  
  return event.markets
    .filter(m => !m.closed && m.outcomePrices)
    .map(m => {
      const prices = JSON.parse(m.outcomePrices);
      const prob = Math.round(parseFloat(prices[0]) * 1000) / 10;
      
      return {
        title: m.groupItemTitle || m.question || event.title,
        probability: prob,
        volume: m.volumeNum || parseFloat(m.volume) || 0,
        volume24h: m.volume24hr || 0,
        volume1wk: m.volume1wk || 0,
        liquidity: m.liquidityNum || parseFloat(m.liquidity) || 0,
        dayChange: Math.round((m.oneDayPriceChange || 0) * 1000) / 10,
        weekChange: Math.round((m.oneWeekPriceChange || 0) * 1000) / 10,
        monthChange: Math.round((m.oneMonthPriceChange || 0) * 1000) / 10,
        bestBid: m.bestBid || null,
        bestAsk: m.bestAsk || null,
        spread: (m.bestAsk && m.bestBid) ? Math.round((m.bestAsk - m.bestBid) * 1000) / 10 : null,
        lastTradePrice: m.lastTradePrice || null,
      };
    })
    .filter(m => m.volume > 0 || m.probability > 0)
    .sort((a, b) => b.volume - a.volume); // 按交易量排序
}

async function monitor() {
  const state = loadState();
  const now = new Date();
  const results = [];
  const alerts = [];
  
  console.error(`[Polymarket Monitor] ${now.toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}`);
  
  for (const market of MARKETS) {
    const event = await fetchEvent(market.slug);
    if (!event) continue;
    
    const subMarkets = parseMarkets(event);
    if (subMarkets.length === 0) continue;
    
    const previousData = state.markets[market.slug] || {};
    const currentData = {};
    
    const marketResult = {
      emoji: market.emoji,
      name: market.name,
      slug: market.slug,
      priority: market.priority,
      totalVolume: event.volume || 0,
      volume24h: event.volume24hr || 0,
      volume1wk: event.volume1wk || 0,
      liquidity: event.liquidity || 0,
      subMarkets: []
    };
    
    for (const sub of subMarkets.slice(0, 5)) { // 最多5个子市场
      const key = sub.title;
      const prev = previousData[key];
      const probChange = prev?.probability !== undefined 
        ? Math.round((sub.probability - prev.probability) * 10) / 10 
        : null;
      const volChange = prev?.volume24h && prev.volume24h > 0
        ? Math.round(((sub.volume24h - prev.volume24h) / prev.volume24h) * 100)
        : null;
      
      currentData[key] = { 
        probability: sub.probability, 
        volume24h: sub.volume24h,
        timestamp: now.toISOString() 
      };
      
      const isProbSignificant = probChange !== null && Math.abs(probChange) >= SIGNIFICANT_PROB_CHANGE;
      const isVolSignificant = volChange !== null && Math.abs(volChange) >= SIGNIFICANT_VOL_CHANGE;
      
      const subResult = {
        title: sub.title,
        probability: sub.probability,
        volume: sub.volume,
        volume24h: sub.volume24h,
        volume1wk: sub.volume1wk,
        liquidity: sub.liquidity,
        dayChange: sub.dayChange,
        weekChange: sub.weekChange,
        monthChange: sub.monthChange,
        spread: sub.spread,
        lastTradePrice: sub.lastTradePrice,
        hourProbChange: probChange,
        hourVolChange: volChange,
        isProbSignificant,
        isVolSignificant,
        isSignificant: isProbSignificant || isVolSignificant
      };
      
      marketResult.subMarkets.push(subResult);
      
      if (isProbSignificant) {
        alerts.push({
          type: 'probability',
          market: market.name,
          subMarket: sub.title,
          emoji: market.emoji,
          from: prev.probability,
          to: sub.probability,
          change: probChange
        });
      }
      
      if (isVolSignificant && sub.volume24h > 10000) { // 只在24h交易量>10K时提醒
        alerts.push({
          type: 'volume',
          market: market.name,
          subMarket: sub.title,
          emoji: market.emoji,
          change: volChange,
          volume24h: sub.volume24h
        });
      }
    }
    
    state.markets[market.slug] = currentData;
    results.push(marketResult);
  }
  
  state.lastCheck = now.toISOString();
  saveState(state);
  
  // 按优先级和24h交易量排序
  results.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.volume24h - a.volume24h;
  });
  
  // 输出结果
  const output = {
    status: alerts.length > 0 ? 'SIGNIFICANT_CHANGES' : 'NORMAL',
    timestamp: now.toISOString(),
    localTime: now.toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }),
    checkInterval: state.lastCheck ? 
      Math.round((now.getTime() - new Date(state.lastCheck).getTime()) / 60000) + ' min ago' : 
      'first check',
    summary: {
      totalMarkets: results.length,
      totalAlerts: alerts.length,
      total24hVolume: results.reduce((sum, m) => sum + (m.volume24h || 0), 0)
    },
    alerts,
    markets: results
  };
  
  console.log(JSON.stringify(output, null, 2));
  return output;
}

await monitor();
