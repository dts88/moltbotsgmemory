#!/usr/bin/env node
/**
 * 外交部例行记者会监控 - 聚焦美伊冲突/霍尔木兹海峡
 * 
 * 数据源: https://www.mfa.gov.cn/fyrbt_673021/
 * 发布规律: 周一至周五，通常下午3点左右（北京时间）
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const STATE_FILE = join(WORKSPACE, '.config/mofa/state.json');
const CONFIG_DIR = join(WORKSPACE, '.config/mofa');

// 确保目录存在
if (!existsSync(CONFIG_DIR)) {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

// 关键词过滤 - 美伊冲突/霍尔木兹相关
const KEYWORDS = [
  // 地理
  '霍尔木兹', 'Hormuz', '波斯湾', '海峡', '中东',
  // 国家
  '伊朗', 'Iran', '美国', '以色列', '沙特', '卡塔尔', '阿联酋', '巴林', '科威特',
  // 事件
  '军事打击', '空袭', '袭击', '冲突', '战争', '封锁',
  // 能源
  '石油', '能源', 'LNG', '天然气', '油气', '原油',
  // 人物
  '哈梅内伊', '特朗普', '鲁比奥',
  // 外交
  '安理会', '联合国', '制裁', '停火'
];

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { lastArticleId: null, lastCheck: null };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// 从外交部网站获取最新记者会列表
async function fetchLatestBriefings() {
  // 记者会实录在 jzhsl_673025 子目录
  const listUrl = 'https://www.mfa.gov.cn/fyrbt_673021/';
  
  const res = await fetch(listUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    },
    signal: AbortSignal.timeout(15000)
  });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch list: ${res.status}`);
  }
  
  const html = await res.text();
  const articles = [];
  
  // 匹配记者会实录链接 (jzhsl_673025 目录)
  // 格式: ./jzhsl_673025/YYYYMM/tYYYYMMDD_XXXXXXXX.shtml
  const jzhslPattern = /href="\.\/jzhsl_673025\/(\d{6})\/t(\d{8})_(\d+)\.shtml"/g;
  let match;
  
  while ((match = jzhslPattern.exec(html)) !== null) {
    articles.push({
      url: `https://www.mfa.gov.cn/fyrbt_673021/jzhsl_673025/${match[1]}/t${match[2]}_${match[3]}.shtml`,
      date: match[2], // YYYYMMDD
      id: match[3]
    });
  }
  
  // 备用: 匹配任何 tYYYYMMDD 格式
  if (articles.length === 0) {
    const altPattern = /href="([^"]*\/(\d{6})\/t(\d{8})_(\d+)\.shtml)"/g;
    while ((match = altPattern.exec(html)) !== null) {
      let url = match[1];
      if (url.startsWith('./')) {
        url = `https://www.mfa.gov.cn/fyrbt_673021/${url.slice(2)}`;
      } else if (!url.startsWith('http')) {
        url = `https://www.mfa.gov.cn${url}`;
      }
      articles.push({
        url,
        date: match[3],
        id: match[4]
      });
    }
  }
  
  // 按日期排序（最新在前）
  articles.sort((a, b) => b.date.localeCompare(a.date));
  
  return articles;
}

// 获取记者会全文
async function fetchBriefingContent(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    },
    signal: AbortSignal.timeout(15000)
  });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch content: ${res.status}`);
  }
  
  const html = await res.text();
  
  // 提取正文内容
  // 尝试多种模式
  let content = '';
  
  // 模式1: id="News_Body_Txt_A"
  const bodyMatch = html.match(/id="News_Body_Txt_A"[^>]*>([\s\S]*?)<\/div>/i);
  if (bodyMatch) {
    content = bodyMatch[1];
  }
  
  // 模式2: class="TRS_Editor"
  if (!content) {
    const trsMatch = html.match(/class="TRS_Editor"[^>]*>([\s\S]*?)<\/div>/i);
    if (trsMatch) {
      content = trsMatch[1];
    }
  }
  
  // 模式3: 直接找问答内容
  if (!content) {
    const qaMatch = html.match(/(记者[：:].+)/gs);
    if (qaMatch) {
      content = qaMatch.join('\n');
    }
  }
  
  // 清理HTML标签
  content = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  // 提取标题中的日期
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/_.*$/, '').trim() : '';
  
  return { content, title };
}

// 提取与关键词相关的问答
function extractRelevantQA(content) {
  // 按问答分段
  const segments = content.split(/(?=(?:新华社|总台央视|法新社|路透社|彭博社|美联社|共同社|阿纳多卢|环球时报|北京青年报|深圳卫视|凤凰卫视|日本广播|韩联社|俄通社|埃菲社|德新社|伊朗|《|【).{0,20}记者[：:])/);
  
  const relevant = [];
  
  for (const segment of segments) {
    if (!segment.trim()) continue;
    
    // 检查是否包含关键词
    const hasKeyword = KEYWORDS.some(kw => 
      segment.toLowerCase().includes(kw.toLowerCase())
    );
    
    if (hasKeyword) {
      // 提取问题和回答
      const lines = segment.trim().split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        relevant.push(segment.trim());
      }
    }
  }
  
  return relevant;
}

// 格式化输出
function formatReport(date, title, qaList) {
  const dateStr = `${date.slice(0,4)}年${date.slice(4,6)}月${date.slice(6,8)}日`;
  
  let report = `📢 外交部例行记者会 (${dateStr})\n`;
  report += `*聚焦: 美伊冲突/霍尔木兹海峡*\n\n`;
  
  if (qaList.length === 0) {
    report += `今日记者会未涉及美伊/霍尔木兹相关问答。`;
    return report;
  }
  
  for (let i = 0; i < qaList.length; i++) {
    const qa = qaList[i];
    
    // 分离问题和回答
    const parts = qa.split(/毛宁[：:]/);
    if (parts.length >= 2) {
      const question = parts[0].trim();
      const answer = parts.slice(1).join('毛宁：').trim();
      
      report += `**Q${i+1}**: ${question}\n\n`;
      report += `**A**: ${answer.slice(0, 500)}${answer.length > 500 ? '...' : ''}\n\n`;
      report += `---\n\n`;
    } else {
      report += qa.slice(0, 600) + (qa.length > 600 ? '...' : '') + '\n\n---\n\n';
    }
  }
  
  return report.trim();
}

// 获取北京时间今天的日期 (YYYYMMDD)
function getTodayBeijing() {
  const now = new Date();
  // 北京时间 = UTC + 8
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = beijingTime.getUTCFullYear();
  const mm = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(beijingTime.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

async function monitor() {
  const state = loadState();
  const now = new Date();
  const nowStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Singapore' });
  const todayBeijing = getTodayBeijing();
  
  console.error(`[MOFA Monitor] ${nowStr}`);
  console.error(`[MOFA Monitor] Looking for today's briefing: ${todayBeijing}`);
  
  try {
    // 获取最新记者会列表
    const articles = await fetchLatestBriefings();
    
    if (articles.length === 0) {
      // 备用: 直接构造今天的URL尝试
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}${mm}${dd}`;
      
      console.error(`No articles found from list, trying direct date lookup...`);
      
      // 尝试搜索
      const searchUrl = `https://www.mfa.gov.cn/fyrbt_673021/${yyyy}${mm}/`;
      console.error(`Checking: ${searchUrl}`);
    }
    
    if (articles.length === 0) {
      console.log(JSON.stringify({
        status: 'NO_ARTICLES',
        message: '未找到记者会文章',
        timestamp: nowStr
      }));
      return;
    }
    
    // 取最新一篇
    const latest = articles[0];
    
    // ★ 关键修改: 检查是否是今天的记者会
    if (latest.date !== todayBeijing) {
      console.log(JSON.stringify({
        status: 'WAITING_FOR_TODAY',
        message: `等待今日(${todayBeijing})记者会发布，最新为${latest.date}`,
        latestDate: latest.date,
        targetDate: todayBeijing,
        timestamp: nowStr
      }));
      return;
    }
    
    // 检查是否已处理 (今天的这篇)
    if (state.lastArticleId === latest.id) {
      console.log(JSON.stringify({
        status: 'ALREADY_PROCESSED',
        message: '今日记者会已处理',
        lastId: latest.id,
        lastDate: latest.date,
        timestamp: nowStr
      }));
      return;
    }
    
    // 获取内容
    const { content, title } = await fetchBriefingContent(latest.url);
    
    if (!content) {
      console.log(JSON.stringify({
        status: 'EMPTY_CONTENT',
        message: '记者会内容为空',
        url: latest.url,
        timestamp: nowStr
      }));
      return;
    }
    
    // 提取相关问答
    const relevantQA = extractRelevantQA(content);
    
    // 更新状态
    state.lastArticleId = latest.id;
    state.lastCheck = now.toISOString();
    saveState(state);
    
    // 生成报告
    const report = formatReport(latest.date, title, relevantQA);
    
    console.log(JSON.stringify({
      status: relevantQA.length > 0 ? 'RELEVANT_CONTENT' : 'NO_RELEVANT',
      date: latest.date,
      url: latest.url,
      relevantCount: relevantQA.length,
      totalLength: content.length,
      report,
      timestamp: nowStr
    }, null, 2));
    
  } catch (error) {
    console.log(JSON.stringify({
      status: 'ERROR',
      error: error.message,
      timestamp: nowStr
    }));
  }
}

// 强制检查模式 (忽略状态)
const forceCheck = process.argv.includes('--force');
if (forceCheck) {
  const stateFile = STATE_FILE;
  if (existsSync(stateFile)) {
    const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    state.lastArticleId = null;
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
  }
}

await monitor();
