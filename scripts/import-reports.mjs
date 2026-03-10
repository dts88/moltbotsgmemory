#!/usr/bin/env node
/**
 * 报告导入脚本
 * 扫描 reports/inbox/，解析 PDF，归档到对应目录，更新知识库
 * 
 * 用法: node scripts/import-reports.mjs [--dry-run]
 */

import fs from 'fs/promises';
import path from 'path';

const INBOX_DIR = '/home/node/clawd/reports/inbox';
const REPORTS_DIR = '/home/node/clawd/reports';
const KB_PATH = '/home/node/clawd/reports/knowledge-base.json';
const INDEX_PATH = '/home/node/clawd/reports/index.json';

// 分类关键词映射（按优先级排序）
const CATEGORY_KEYWORDS = {
  crude: ['crude', 'crd', 'cdi', 'oil', 'wti', 'brent', 'dubai', 'murban', 'oman', '原油'],
  lng: ['lng', 'lngd', 'natural gas', 'jkm', 'ttf', 'methanol', 'aggm', '天然气', '液化天然气'],
  lpg: ['lpg', 'propane', 'butane', '液化石油气', '丙烷', '丁烷'],
  products: ['gasoline', 'diesel', 'jet', 'naphtha', 'fuel oil', 'gasoil', 'amarinef', 'usp', 'app', 'epr', 'amgio', 'mid', 'wcp', 'ici', 'mck', '汽油', '柴油', '航煤', '石脑油', '燃料油'],
  freight: ['freight', 'tanker', 'shipping', 'vessel', '运费', '油轮'],
  derivatives: ['swap', 'derivative', 'paper', 'acedb', '纸货', '衍生品'],
  knowledge: ['outlook', 'forecast', 'annual', '展望', '年度', '产能'],
  market: ['market', 'weekly', 'daily', '市场', '周报', '日报']
};

// 来源识别
const SOURCE_PATTERNS = {
  'Argus': /argus/i,
  'Platts': /platts|spglobal/i,
  '隆众资讯': /隆众|oilchem/i,
  '卓创资讯': /卓创|sci99/i,
  'EIA': /\beia\b/i,
  'IEA': /\biea\b/i
};

// 报告类型识别
const TYPE_PATTERNS = {
  daily: /daily|日报/i,
  weekly: /weekly|周报/i,
  monthly: /monthly|月报/i,
  annual: /annual|yearly|年度|年报/i,
  special: /special|outlook|展望/i
};

async function loadPdfJs() {
  // 尝试多个可能的路径
  const paths = [
    '/tmp/node_modules/pdfjs-dist/legacy/build/pdf.mjs',
    '/tmp/node_modules/pdfjs-dist/build/pdf.mjs',
    'pdfjs-dist/legacy/build/pdf.mjs'
  ];
  
  for (const pdfPath of paths) {
    try {
      const pdfjsLib = await import(pdfPath);
      return pdfjsLib;
    } catch (e) {
      continue;
    }
  }
  
  console.error('pdfjs-dist not found. Run: cd /tmp && npm install pdfjs-dist');
  return null;
}

async function extractPdfText(filePath, pdfjsLib, maxPages = 5) {
  try {
    const buffer = await fs.readFile(filePath);
    const data = new Uint8Array(buffer);
    const doc = await pdfjsLib.getDocument({ data }).promise;
    
    let text = '';
    const pagesToRead = Math.min(doc.numPages, maxPages);
    
    for (let i = 1; i <= pagesToRead; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    
    return { text, numPages: doc.numPages };
  } catch (e) {
    console.error(`Failed to extract ${filePath}: ${e.message}`);
    return { text: '', numPages: 0 };
  }
}

function detectCategory(filename, text) {
  const filenameLower = filename.toLowerCase();
  const textLower = text.toLowerCase();
  
  // 先检查文件名（更可靠）
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (filenameLower.includes(kw.toLowerCase())) {
        return category;
      }
    }
  }
  
  // 再检查内容
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (textLower.includes(kw.toLowerCase())) {
        return category;
      }
    }
  }
  
  return 'market'; // 默认
}

function detectSource(filename, text) {
  const combined = filename + ' ' + text;
  
  for (const [source, pattern] of Object.entries(SOURCE_PATTERNS)) {
    if (pattern.test(combined)) {
      return source;
    }
  }
  return 'Unknown';
}

function detectType(filename, text) {
  const combined = filename + ' ' + text;
  
  for (const [type, pattern] of Object.entries(TYPE_PATTERNS)) {
    if (pattern.test(combined)) {
      return type;
    }
  }
  return 'report';
}

function extractDate(filename, text) {
  // 尝试从文件名提取日期 - 格式 20260209xxx.pdf
  const match1 = filename.match(/^(\d{4})(\d{2})(\d{2})/);
  if (match1) {
    return `${match1[1]}-${match1[2]}-${match1[3]}`;
  }
  
  // 其他格式
  const match2 = filename.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  if (match2) {
    return `${match2[1]}-${match2[2]}-${match2[3]}`;
  }
  
  // 默认用今天
  return new Date().toISOString().split('T')[0];
}

function generateFilename(source, title, date, ext) {
  const safeTitle = title.replace(/[^\w\u4e00-\u9fa5_-]/g, '_').substring(0, 50);
  const dateStr = date.replace(/-/g, '');
  return `${dateStr}_${source}_${safeTitle}${ext}`;
}

async function checkDuplicate(destDir, source, date, title) {
  // 检查同一来源、同一日期、同一报告类型是否已存在
  try {
    const files = await fs.readdir(destDir);
    const dateStr = date.replace(/-/g, '');
    // 匹配完整的文件名模式: 日期_来源_类型
    const pattern = new RegExp(`^${dateStr}_${source}_${title}`, 'i');
    
    for (const file of files) {
      if (pattern.test(file)) {
        return file;
      }
    }
  } catch (e) {
    // 目录不存在，无重复
  }
  return null;
}

async function processFile(filePath, pdfjsLib, dryRun) {
  const filename = path.basename(filePath);
  const ext = path.extname(filename).toLowerCase();
  
  if (ext !== '.pdf') {
    console.log(`Skipping non-PDF: ${filename}`);
    return null;
  }
  
  console.log(`\nProcessing: ${filename}`);
  
  // 提取文本
  const { text, numPages } = await extractPdfText(filePath, pdfjsLib);
  
  // 检测元数据
  const category = detectCategory(filename, text);
  const source = detectSource(filename, text);
  const type = detectType(filename, text);
  const date = extractDate(filename, text);
  
  // 生成新文件名
  const title = filename.replace(ext, '').replace(/^\d{8}_?/, '');
  const newFilename = generateFilename(source, title, date, ext);
  const destDir = path.join(REPORTS_DIR, category);
  const destPath = path.join(destDir, newFilename);
  
  const result = {
    original: filename,
    newName: newFilename,
    category,
    source,
    type,
    date,
    pages: numPages,
    destPath
  };
  
  console.log(`  → Category: ${category}`);
  console.log(`  → Source: ${source}`);
  console.log(`  → Type: ${type}`);
  console.log(`  → Date: ${date}`);
  console.log(`  → Pages: ${numPages}`);
  console.log(`  → Dest: ${destPath}`);
  
  // 检查重复 - 基于完整文件名（日期+来源+类型）
  const duplicate = await checkDuplicate(destDir, source, date, title);
  if (duplicate) {
    console.log(`  ⚠️ Duplicate found: ${duplicate}`);
    if (!dryRun) {
      // 删除重复的新文件
      await fs.unlink(filePath);
      console.log(`  🗑️ Removed duplicate from inbox`);
    } else {
      console.log(`  [DRY RUN] Would remove duplicate from inbox`);
    }
    return { ...result, skipped: true, reason: 'duplicate' };
  }
  
  if (!dryRun) {
    // 确保目标目录存在
    await fs.mkdir(destDir, { recursive: true });
    
    // 移动文件
    await fs.rename(filePath, destPath);
    console.log(`  ✓ Moved`);
  } else {
    console.log(`  [DRY RUN] Would move to ${destPath}`);
  }
  
  return result;
}

async function updateIndex(results, dryRun) {
  if (dryRun || results.length === 0) return;
  
  let index = { reports: [] };
  try {
    const data = await fs.readFile(INDEX_PATH, 'utf-8');
    index = JSON.parse(data);
  } catch (e) {
    // 文件不存在，用空索引
  }
  
  // 用 Set 跟踪已存在的路径，避免重复
  const existingPaths = new Set(index.reports.map(r => r.path));
  
  for (const r of results) {
    if (!r) continue;
    
    const relPath = r.destPath.replace(REPORTS_DIR + '/', '');
    
    // 跳过已存在的
    if (existingPaths.has(relPath)) {
      continue;
    }
    
    index.reports.push({
      path: relPath,
      source: r.source,
      type: r.type,
      category: r.category,
      date: r.date,
      pages: r.pages,
      importedAt: new Date().toISOString()
    });
    
    existingPaths.add(relPath);
  }
  
  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2));
  console.log(`\n✓ Updated index.json`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  if (dryRun) {
    console.log('=== DRY RUN MODE ===\n');
  }
  
  // 加载 pdfjs
  const pdfjsLib = await loadPdfJs();
  if (!pdfjsLib) {
    process.exit(1);
  }
  
  // 扫描 inbox
  let files;
  try {
    files = await fs.readdir(INBOX_DIR);
  } catch (e) {
    console.error(`Cannot read inbox: ${e.message}`);
    process.exit(1);
  }
  
  const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
  
  if (pdfFiles.length === 0) {
    console.log('No PDF files in inbox.');
    return;
  }
  
  console.log(`Found ${pdfFiles.length} PDF(s) in inbox\n`);
  
  const results = [];
  for (const file of pdfFiles) {
    const result = await processFile(path.join(INBOX_DIR, file), pdfjsLib, dryRun);
    results.push(result);
  }
  
  // 更新索引
  await updateIndex(results.filter(r => r !== null), dryRun);
  
  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${results.filter(r => r !== null).length}`);
  console.log(`Skipped: ${results.filter(r => r === null).length}`);
}

main().catch(console.error);
