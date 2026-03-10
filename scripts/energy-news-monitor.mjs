#!/usr/bin/env node
/**
 * Energy News Monitor - 能源新闻聚合监控
 * 通过 Google News RSS 追踪中东能源相关新闻
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseStringPromise } from 'xml2js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const STATE_FILE = join(WORKSPACE, '.config/energy-news/state.json');

// 确保目录存在
const configDir = join(WORKSPACE, '.config/energy-news');
if (!existsSync(configDir)) {
  mkdirSync(configDir, { recursive: true });
}

// 监控的搜索词（能源相关，重点中东/霍尔木兹/OPEC）
const SEARCH_TOPICS = [
  { key: 'hormuz', query: 'Strait of Hormuz oil', label: '🌊 霍尔木兹海峡' },
  { key: 'saudi_oil', query: 'Saudi Arabia oil energy', label: '🇸🇦 沙特能源' },
  { key: 'iran_oil', query: 'Iran oil sanctions', label: '🇮🇷 伊朗石油' },
  { key: 'opec', query: 'OPEC production output', label: '🛢️ OPEC' },
  { key: 'aramco', query: 'Saudi Aramco', label: '⛽ 阿美' },
];

// 高优先级来源（官方/权威）
const PRIORITY_SOURCES = [
  'reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com',
  'spa.gov.sa', 'wam.ae',  // 官方通讯社
  'spglobal.com', 'argus', 'platts',  // 专业能源媒体
  'opec.org', 'iea.org', 'eia.gov'
];

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { lastCheck: null, seenUrls: [] };
}

function saveState(state) {
  // 只保留最近 500 条
  if (state.seenUrls.length > 500) {
    state.seenUrls = state.seenUrls.slice(-500);
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchGoogleNewsRSS(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
      'Accept': 'application/rss+xml'
    },
    signal: AbortSignal.timeout(15000)
  });
  
  if (!res.ok) {
    throw new Error(`RSS fetch failed: ${res.status}`);
  }
  
  const xml = await res.text();
  const result = await parseStringPromise(xml);
  
  const items = result?.rss?.channel?.[0]?.item || [];
  return items.map(item => ({
    title: item.title?.[0] || '',
    link: item.link?.[0] || '',
    pubDate: item.pubDate?.[0] || '',
    source: item.source?.[0]?._ || item.source?.[0] || 'Unknown',
    sourceUrl: item.source?.[0]?.$?.url || ''
  }));
}

function isPrioritySource(sourceUrl) {
  const url = (sourceUrl || '').toLowerCase();
  return PRIORITY_SOURCES.some(s => url.includes(s));
}

function getAgeHours(pubDate) {
  const pub = new Date(pubDate);
  return (Date.now() - pub.getTime()) / (1000 * 60 * 60);
}

async function monitor() {
  const state = loadState();
  const now = new Date();
  const nowSGT = now.toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
  
  const allNews = [];
  const errors = [];
  
  // 获取各主题新闻
  for (const topic of SEARCH_TOPICS) {
    try {
      const items = await fetchGoogleNewsRSS(topic.query);
      
      // 过滤：24小时内 + 未见过
      const fresh = items.filter(item => {
        const age = getAgeHours(item.pubDate);
        const seen = state.seenUrls.includes(item.link);
        return age <= 24 && !seen;
      });
      
      for (const item of fresh.slice(0, 5)) {  // 每主题最多5条
        allNews.push({
          ...item,
          topic: topic.key,
          label: topic.label,
          priority: isPrioritySource(item.sourceUrl)
        });
        state.seenUrls.push(item.link);
      }
    } catch (e) {
      errors.push(`${topic.key}: ${e.message}`);
    }
  }
  
  state.lastCheck = now.toISOString();
  saveState(state);
  
  // 按优先级和时间排序
  allNews.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return new Date(b.pubDate) - new Date(a.pubDate);
  });
  
  // 生成报告
  if (allNews.length === 0) {
    console.log(JSON.stringify({
      status: 'NO_NEW',
      message: '无新闻更新',
      timestamp: nowSGT,
      errors
    }));
    return;
  }
  
  let report = `📰 能源新闻速览\n${nowSGT} SGT\n\n`;
  
  // 按主题分组
  const byTopic = {};
  for (const item of allNews) {
    if (!byTopic[item.topic]) byTopic[item.topic] = [];
    byTopic[item.topic].push(item);
  }
  
  for (const [topic, items] of Object.entries(byTopic)) {
    const label = items[0].label;
    report += `${label}\n`;
    
    for (const item of items.slice(0, 3)) {
      const priority = item.priority ? '⭐ ' : '';
      report += `${priority}• ${item.title}\n`;
      report += `  ${item.source}\n`;
    }
    report += '\n';
  }
  
  console.log(JSON.stringify({
    status: 'NEW_ITEMS',
    count: allNews.length,
    timestamp: nowSGT,
    news: allNews,
    report,
    errors
  }, null, 2));
}

// 检查依赖
try {
  await import('xml2js');
} catch (e) {
  console.error('需要安装 xml2js: npm install xml2js');
  process.exit(1);
}

await monitor();
