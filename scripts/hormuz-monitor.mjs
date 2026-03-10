#!/usr/bin/env node
/**
 * Hormuz Monitor - 霍尔木兹海峡封锁概率监控
 * 每30分钟运行，追踪实际变化
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const STATE_FILE = join(WORKSPACE, '.config/polymarket/hormuz-state.json');
const API_URL = 'https://gamma-api.polymarket.com/events?slug=will-iran-close-the-strait-of-hormuz-by-2027';

// 确保目录存在
const configDir = join(WORKSPACE, '.config/polymarket');
if (!existsSync(configDir)) {
  mkdirSync(configDir, { recursive: true });
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { lastCheck: null, markets: {}, todayHigh: {}, todayLow: {} };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchData() {
  const res = await fetch(API_URL, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data[0];
}

function formatVol(v) {
  if (v >= 1e6) return `$${(v/1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v/1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

async function monitor() {
  const state = loadState();
  const now = new Date();
  const nowSGT = now.toLocaleString('en-SG', { 
    timeZone: 'Asia/Singapore',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
  
  const event = await fetchData();
  const markets = event.markets
    .filter(m => m.active && !m.closed && m.outcomePrices)
    .map(m => {
      const prices = JSON.parse(m.outcomePrices);
      return {
        title: m.groupItemTitle,
        prob: Math.round(parseFloat(prices[0]) * 1000) / 10,
        volume24h: m.volume24hr || 0,
        bid: m.bestBid,
        ask: m.bestAsk
      };
    })
    .sort((a, b) => {
      const order = { 'March 31': 1, 'June 30': 2, 'December 31': 3 };
      return (order[a.title] || 99) - (order[b.title] || 99);
    });

  // 计算变化
  const results = [];
  const alerts = [];
  const today = now.toISOString().split('T')[0];
  
  // 重置每日高低点（如果是新的一天）
  if (state.lastDay !== today) {
    state.todayHigh = {};
    state.todayLow = {};
    state.lastDay = today;
  }

  for (const m of markets) {
    const prev = state.markets[m.title];
    const change = prev !== undefined ? Math.round((m.prob - prev) * 10) / 10 : null;
    
    // 更新日内高低点
    if (!state.todayHigh[m.title] || m.prob > state.todayHigh[m.title]) {
      state.todayHigh[m.title] = m.prob;
    }
    if (!state.todayLow[m.title] || m.prob < state.todayLow[m.title]) {
      state.todayLow[m.title] = m.prob;
    }
    
    const fromHigh = Math.round((m.prob - state.todayHigh[m.title]) * 10) / 10;
    
    results.push({
      title: m.title,
      prob: m.prob,
      change,
      fromHigh,
      high: state.todayHigh[m.title],
      low: state.todayLow[m.title],
      bid: m.bid,
      ask: m.ask
    });
    
    // 警报：30分钟内变化超过2%
    if (change !== null && Math.abs(change) >= 2) {
      alerts.push({ title: m.title, change, prob: m.prob });
    }
    
    state.markets[m.title] = m.prob;
  }
  
  state.lastCheck = now.toISOString();
  saveState(state);
  
  // 生成报告
  const vol24h = formatVol(event.volume24hr || 0);
  const hasAlert = alerts.length > 0;
  
  let report = hasAlert ? '⚠️ ' : '';
  report += `🌊 霍尔木兹封锁监控\n${nowSGT} SGT\n\n`;
  
  for (const r of results) {
    const changeStr = r.change !== null 
      ? ` (${r.change >= 0 ? '+' : ''}${r.change}%)` 
      : '';
    const arrow = r.change > 0 ? '🔺' : r.change < 0 ? '🔻' : '';
    report += `• ${r.title}: ${r.prob}%${changeStr} ${arrow}\n`;
  }
  
  report += `\n24h交易量: ${vol24h}\n`;
  report += `\n日内高/低:\n`;
  for (const r of results) {
    report += `• ${r.title}: ${r.high}% / ${r.low}%\n`;
  }
  
  if (hasAlert) {
    report += `\n⚠️ 30分钟内变化超2%`;
  }
  
  console.log(JSON.stringify({
    status: hasAlert ? 'ALERT' : 'NORMAL',
    timestamp: now.toISOString(),
    localTime: nowSGT,
    volume24h: event.volume24hr,
    markets: results,
    alerts,
    report
  }, null, 2));
}

await monitor();
