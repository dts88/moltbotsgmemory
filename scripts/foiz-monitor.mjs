#!/usr/bin/env node
/**
 * FOIZ Monitor - 富查伊拉成品油库存周报监控
 * 数据来源: Platts News Insights API
 * 发布时间: 每周二 (数据截至上周日)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CONFIG_FILE = join(WORKSPACE, '.config/spglobal/credentials.json');
const STATE_FILE = join(WORKSPACE, '.config/foiz/state.json');

const API_BASE = 'https://api.platts.com';

// 确保目录存在
const configDir = join(WORKSPACE, '.config/foiz');
if (!existsSync(configDir)) {
  mkdirSync(configDir, { recursive: true });
}

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    throw new Error('Platts credentials not found');
  }
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { lastArticleId: null, lastData: null };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchFoizArticle(token) {
  const url = `${API_BASE}/news-insights/v1/search/story?pageSize=20&q=fujairah+inventory`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(15000)
  });
  
  if (!res.ok) {
    if (res.status === 401) throw new Error('TOKEN_EXPIRED');
    throw new Error(`Search API error: ${res.status}`);
  }
  
  const data = await res.json();
  
  // 找 FUJAIRAH DATA 文章
  const article = (data.results || []).find(r => 
    r.headline && r.headline.includes('FUJAIRAH DATA:')
  );
  
  return article;
}

async function fetchArticleContent(token, id) {
  const url = `${API_BASE}/news-insights/v1/content/${id}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(15000)
  });
  
  if (!res.ok) {
    throw new Error(`Content API error: ${res.status}`);
  }
  
  const data = await res.json();
  return data.envelope;
}

function parseInventoryData(body) {
  const text = stripHtml(body);
  const data = {
    total: null,
    light: null,
    middle: null,
    heavy: null,
    dataDate: null,
    publishDate: null
  };
  
  // 提取数据日期: "week ended Feb. 23"
  const dateMatch = text.match(/week\s+end(?:ed|ing)\s+([A-Z][a-z]+\.?\s+\d+)/i);
  if (dateMatch) {
    data.dataDate = dateMatch[1];
  }
  
  // 提取发布日期: "published Feb. 25"
  const pubMatch = text.match(/published\s+([A-Z][a-z]+\.?\s+\d+)/i);
  if (pubMatch) {
    data.publishDate = pubMatch[1];
  }
  
  // 总库存: "total dropped 0.1% ... to 20.528 million barrels"
  const totalMatch = text.match(/total\s+(dropped|fell|rose|climbed|gained)\s+(\d+\.?\d*)%[^.]*?(\d+\.?\d*)\s*million\s*barrels/i);
  if (totalMatch) {
    const isDown = ['dropped', 'fell'].includes(totalMatch[1].toLowerCase());
    data.total = {
      value: parseFloat(totalMatch[3]),
      change: isDown ? -parseFloat(totalMatch[2]) : parseFloat(totalMatch[2])
    };
  } else {
    // fallback: just value
    const totalSimple = text.match(/(\d+\.?\d*)\s*million\s*barrels/i);
    if (totalSimple) {
      data.total = { value: parseFloat(totalSimple[1]), change: null };
    }
  }
  
  // 解析模式: "Light distillates... fell 1.5% to 9.737 million barrels"
  const parseCategory = (pattern) => {
    // Pattern 1: "fell/climbed X% to Y million barrels"
    const match1 = text.match(new RegExp(pattern + '[^.]*?(fell|dropped|rose|climbed|gained)\\s+(\\d+\\.?\\d*)%\\s+to\\s+(\\d+\\.?\\d*)\\s*million', 'i'));
    if (match1) {
      const isDown = ['fell', 'dropped'].includes(match1[1].toLowerCase());
      return {
        value: parseFloat(match1[3]),
        change: isDown ? -parseFloat(match1[2]) : parseFloat(match1[2])
      };
    }
    
    // Pattern 2: just "X million barrels"
    const match2 = text.match(new RegExp(pattern + '[^.]*?(\\d+\\.?\\d*)\\s*million\\s*barrels', 'i'));
    if (match2) {
      return { value: parseFloat(match2[1]), change: null };
    }
    
    return null;
  };
  
  data.light = parseCategory('light\\s+distillates');
  data.middle = parseCategory('middle\\s+distillates');
  data.heavy = parseCategory('heavy\\s+distillates');
  
  return data;
}

function formatReport(data, headline, state) {
  const now = new Date();
  const nowSGT = now.toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  
  let report = `📊 富查伊拉 (FOIZ) 成品油库存周报\n`;
  report += `数据截至: ${data.dataDate || 'N/A'}\n\n`;
  
  // 总库存
  if (data.total) {
    const change = data.total.change !== null ? 
      ` (${data.total.change >= 0 ? '+' : ''}${data.total.change.toFixed(1)}% w/w)` : '';
    report += `总库存: ${data.total.value.toFixed(2)} 百万桶${change}\n\n`;
  }
  
  report += `分类库存:\n`;
  report += `━━━━━━━━━━━━━━━━━━━━\n`;
  
  const categories = [
    { key: 'light', name: 'Light Distillates (轻质馏分)', desc: '汽油、石脑油' },
    { key: 'middle', name: 'Middle Distillates (中质馏分)', desc: '柴油、航煤' },
    { key: 'heavy', name: 'Heavy Distillates & Residues (重质馏分)', desc: '燃料油、船用燃料' }
  ];
  
  for (const cat of categories) {
    const d = data[cat.key];
    if (d) {
      report += `${cat.name}\n`;
      report += `  ${cat.desc}\n`;
      report += `  ${d.value.toFixed(2)} 百万桶\n`;
      
      if (d.change !== null) {
        const dir = d.change >= 0 ? '周增' : '周降';
        report += `  ${dir}: ${d.change >= 0 ? '+' : ''}${d.change.toFixed(1)}%\n`;
      }
      report += `\n`;
    }
  }
  
  report += `━━━━━━━━━━━━━━━━━━━━\n`;
  report += `数据来源: FOIZ/S&P Global Platts\n`;
  if (data.publishDate) {
    report += `发布日期: ${data.publishDate}`;
  }
  
  return report;
}

async function monitor() {
  const config = loadConfig();
  const state = loadState();
  const token = config.access_token;
  
  // 1. 搜索最新文章
  const article = await searchFoizArticle(token);
  
  if (!article) {
    console.log(JSON.stringify({
      status: 'NO_DATA',
      message: '未找到 FUJAIRAH DATA 文章'
    }));
    return;
  }
  
  const articleId = article.articleId || article.id;
  
  // 2. 检查是否是新文章
  if (articleId === state.lastArticleId) {
    console.log(JSON.stringify({
      status: 'NO_UPDATE',
      message: '无新数据',
      lastHeadline: article.headline
    }));
    return;
  }
  
  // 3. 获取文章内容
  const content = await fetchArticleContent(token, articleId);
  const body = content?.content?.body || '';
  const headline = content?.properties?.headline?.headline || article.headline;
  
  // 4. 解析数据
  const data = parseInventoryData(body);
  
  // 5. 生成报告
  const report = formatReport(data, headline, state);
  
  // 6. 保存状态
  state.lastArticleId = articleId;
  state.lastData = data;
  state.lastUpdate = new Date().toISOString();
  saveState(state);
  
  // 7. 输出
  console.log(JSON.stringify({
    status: 'NEW_DATA',
    headline,
    articleId,
    data,
    report
  }, null, 2));
}

// 运行
await monitor();
