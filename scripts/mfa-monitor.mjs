#!/usr/bin/env node
/**
 * 外交部例行记者会监控
 * 抓取最新记者会内容，筛选能源/地缘/中美相关议题并推送
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

// 两个监控源
const SOURCES = {
  regular: {
    name: '例行记者会',
    listUrl: 'https://www.mfa.gov.cn/web/wjdt_674879/fyrbt_674889/',
    pattern: /<li><a href="\.\/(\d{6}\/t\d{8}_\d+\.shtml)" target="_blank">(\d{4}年\d{1,2}月\d{1,2}日外交部发言人.+主持例行记者会)/g
  },
  adhoc: {
    name: '发言人表态和电话答问',
    listUrl: 'https://www.mfa.gov.cn/fyrbt_673021/dhdw_673027/',
    pattern: /<li><a href="\.\/(\d{6}\/t\d{8}_\d+\.shtml)" target="_blank">(外交部发言人[^（]+答记者问)/g
  }
};
const STATE_FILE = '/home/node/clawd/.mfa-monitor-state.json';

// 关键词过滤 - 聚焦能源及影响能源的地缘政治
const KEYWORDS = {
  // 能源直接相关 - 高优先级
  energy: ['能源', '石油', '天然气', 'LNG', '原油', '煤炭', '电力', '新能源', '光伏', '风电', 
           '核电', 'OPEC', '油价', '气价', '管道', '炼油', '油气', '碳排放', '碳中和',
           '委内瑞拉', '沙特', '阿联酋', '卡塔尔', '科威特', '伊拉克'],
  // 影响能源供应的地缘政治
  energy_geopolitics: ['俄罗斯', '乌克兰', '伊朗', '中东', '霍尔木兹', '苏伊士', '马六甲',
                       '制裁', '禁运', '出口管制', '油轮', '船运'],
  // 中美能源相关 - 仅当涉及能源时
  us_china_energy: ['美国能源', '能源部', '页岩油', '页岩气', 'LNG出口', '能源安全']
};

// 排除关键词 - 非能源相关的一般性议题
const EXCLUDE_TOPICS = [
  '台湾', '赖清德', '台独', '统一',  // 台湾问题（除非涉及能源）
  '巴勒斯坦', '加沙', '以色列', '约旦河西岸', '两国方案',  // 巴以（除非影响中东油气）
  '半导体', '芯片', '安世',  // 科技争端
  '钱凯港', '秘鲁',  // 拉美一般事务
  '维和', '人权', '民主'  // 一般性议题
];

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    }
  });
  return await res.text();
}

async function getLatestItems(source) {
  const html = await fetchPage(source.listUrl);
  const regex = new RegExp(source.pattern.source, 'g');
  const matches = [...html.matchAll(regex)];
  
  if (matches.length === 0) {
    return [];
  }
  
  return matches.slice(0, 5).map(m => ({
    url: `${source.listUrl}${m[1]}`,
    title: m[2],
    sourceName: source.name
  }));
}

async function fetchConferenceContent(url) {
  const html = await fetchPage(url);
  
  // 提取正文区域
  const contentMatch = html.match(/class="view_default[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div class="info"/);
  if (!contentMatch) {
    // 备选：提取 TRS_UEDITOR 区域
    const altMatch = html.match(/class="[^"]*TRS_UEDITOR[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (altMatch) {
      return altMatch[1];
    }
  }
  
  return contentMatch ? contentMatch[1] : html;
}

function parseQA(htmlContent) {
  const qaBlocks = [];
  
  // 提取所有 <p> 标签内容
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs = [];
  let match;
  
  while ((match = pRegex.exec(htmlContent)) !== null) {
    // 清理HTML
    let text = match[1]
      .replace(/<strong[^>]*>/gi, '【Q】')
      .replace(/<\/strong>/gi, '【/Q】')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&mdash;/g, '—')
      .trim();
    
    if (text && !text.match(/^[\s]*$/)) {
      paragraphs.push(text);
    }
  }
  
  // 解析问答
  let currentQ = null;
  let currentA = [];
  
  for (const para of paragraphs) {
    // 检测问题（被 strong 包裹的记者提问）
    if (para.includes('【Q】') && para.match(/记者[：:]/)) {
      // 保存上一个问答
      if (currentQ) {
        qaBlocks.push({ question: currentQ, answer: currentA.join('\n') });
      }
      // 提取问题文本
      currentQ = para.replace(/【\/?Q】/g, '').trim();
      currentA = [];
    } else if (currentQ && !para.includes('【Q】')) {
      // 回答内容
      currentA.push(para.replace(/【\/?Q】/g, '').trim());
    }
  }
  
  // 保存最后一个问答
  if (currentQ) {
    qaBlocks.push({ question: currentQ, answer: currentA.join('\n') });
  }
  
  return qaBlocks;
}

function matchesKeywords(text, category) {
  const keywords = KEYWORDS[category] || [];
  for (const kw of keywords) {
    if (text.includes(kw)) return true;
  }
  return false;
}

function isExcludedTopic(text) {
  // 检查是否命中排除关键词
  for (const kw of EXCLUDE_TOPICS) {
    if (text.includes(kw)) return true;
  }
  return false;
}

function filterRelevantQA(qaBlocks) {
  const relevant = [];
  
  for (const qa of qaBlocks) {
    const fullText = qa.question + ' ' + qa.answer;
    
    // 能源直接相关 - 最高优先级，无论是否有排除词
    const isDirectEnergy = matchesKeywords(fullText, 'energy');
    
    // 影响能源的地缘政治
    const isEnergyGeopolitics = matchesKeywords(fullText, 'energy_geopolitics');
    
    // 中美能源相关
    const isUSChinaEnergy = matchesKeywords(fullText, 'us_china_energy');
    
    // 如果是能源直接相关，直接收录
    if (isDirectEnergy) {
      relevant.push({ ...qa, categories: ['能源'] });
      continue;
    }
    
    // 如果是影响能源的地缘政治，且不是被排除的一般性议题
    if (isEnergyGeopolitics && !isExcludedTopic(fullText)) {
      relevant.push({ ...qa, categories: ['能源地缘'] });
      continue;
    }
    
    // 中美能源相关
    if (isUSChinaEnergy) {
      relevant.push({ ...qa, categories: ['中美能源'] });
      continue;
    }
  }
  
  return relevant;
}

function summarize(title, relevantQA) {
  if (relevantQA.length === 0) {
    return null;
  }
  
  let summary = `📢 ${title}\n\n`;
  
  for (const qa of relevantQA) {
    const tags = qa.categories.map(c => `#${c}`).join(' ');
    summary += `${tags}\n`;
    summary += `Q: ${qa.question.substring(0, 100)}${qa.question.length > 100 ? '...' : ''}\n`;
    
    // 提取回答要点（取前300字）
    const answerPreview = qa.answer.substring(0, 300);
    summary += `A: ${answerPreview}${qa.answer.length > 300 ? '...' : ''}\n\n`;
  }
  
  return summary.trim();
}

function loadState() {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  }
  return { processedUrls: [] };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function processItem(item, state) {
  // 检查是否已处理
  if (state.processedUrls.includes(item.url)) {
    return null;
  }
  
  console.log(`\n处理: ${item.title}`);
  console.log('URL:', item.url);
  
  // 获取内容
  const content = await fetchConferenceContent(item.url);
  console.log('内容长度:', content.length);
  
  // 解析问答
  const qaBlocks = parseQA(content);
  console.log('问答数量:', qaBlocks.length);
  
  // 如果是临时答问且解析失败，尝试作为整体处理
  let relevant;
  if (qaBlocks.length === 0 && item.sourceName === '发言人表态和电话答问') {
    // 临时答问可能不是Q&A格式，直接检查全文
    const categories = [];
    if (matchesKeywords(content, 'energy')) categories.push('能源');
    if (matchesKeywords(content, 'geopolitics')) categories.push('地缘');
    if (matchesKeywords(content, 'us_china')) categories.push('中美');
    
    if (categories.length > 0) {
      relevant = [{ 
        question: item.title, 
        answer: content.replace(/<[^>]+>/g, '').substring(0, 500),
        categories 
      }];
    } else {
      relevant = [];
    }
  } else {
    relevant = filterRelevantQA(qaBlocks);
  }
  
  console.log('相关议题数量:', relevant.length);
  
  if (relevant.length === 0) {
    return { url: item.url, status: 'no_relevant' };
  }
  
  // 生成摘要
  const summary = summarize(`[${item.sourceName}] ${item.title}`, relevant);
  
  return {
    url: item.url,
    title: item.title,
    sourceName: item.sourceName,
    relevantCount: relevant.length,
    summary
  };
}

async function main() {
  console.log('=== 外交部发言人监控 ===');
  console.log('时间:', new Date().toISOString());
  
  const state = loadState();
  const results = [];
  const newProcessed = [...state.processedUrls];
  
  try {
    // 检查两个来源
    for (const [key, source] of Object.entries(SOURCES)) {
      console.log(`\n--- 检查: ${source.name} ---`);
      
      const items = await getLatestItems(source);
      console.log(`找到 ${items.length} 条`);
      
      for (const item of items) {
        if (state.processedUrls.includes(item.url)) {
          console.log(`跳过(已处理): ${item.title.substring(0, 30)}...`);
          continue;
        }
        
        const result = await processItem(item, state);
        if (result) {
          newProcessed.push(item.url);
          if (result.summary) {
            results.push(result);
          }
        }
      }
    }
    
    // 保存状态（只保留最近50条）
    saveState({ 
      processedUrls: newProcessed.slice(-50),
      lastCheck: new Date().toISOString()
    });
    
    if (results.length === 0) {
      console.log('\n无新的相关内容');
      return { status: 'no_new', checkedSources: Object.keys(SOURCES) };
    }
    
    // 合并所有摘要
    const combinedSummary = results.map(r => r.summary).join('\n\n---\n\n');
    
    console.log('\n=== 摘要 ===');
    console.log(combinedSummary);
    
    return {
      status: 'new',
      count: results.length,
      items: results.map(r => ({ title: r.title, sourceName: r.sourceName })),
      summary: combinedSummary
    };
    
  } catch (error) {
    console.error('错误:', error.message);
    return { status: 'error', error: error.message };
  }
}

// 运行
main().then(result => {
  console.log('\n结果:', JSON.stringify(result, null, 2));
  if (result.summary) {
    // 输出摘要供调用者使用
    console.log('\n=== SUMMARY_START ===');
    console.log(result.summary);
    console.log('=== SUMMARY_END ===');
  }
});
