#!/usr/bin/env node
/**
 * RAG Index Builder for PDF Reports
 * 提取PDF文本 → 切片 → 生成嵌入 → 存入索引
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '../../reports');
const INDEX_FILE = path.join(__dirname, '../../.rag-index.json');
const CHUNK_SIZE = 500;  // 字符数
const CHUNK_OVERLAP = 100;  // 重叠字符数

// 动态导入
let pdfjsLib = null;
let pipeline = null;
let embedder = null;

async function initPdfJs() {
  if (!pdfjsLib) {
    // 在Node环境下使用CommonJS require来避免ESM问题
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    // 先尝试从/tmp加载（之前安装的版本）
    try {
      pdfjsLib = require('/tmp/node_modules/pdfjs-dist/legacy/build/pdf.js');
    } catch {
      pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    }
  }
  return pdfjsLib;
}

async function initEmbedder() {
  if (!embedder) {
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
    console.log('[RAG] Loading embedding model (first time may take a while)...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('[RAG] Embedding model loaded ✓');
  }
  return embedder;
}

async function extractTextFromPdf(pdfPath) {
  const pdfjs = await initPdfJs();
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data }).promise;
  
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n\n';
  }
  
  return fullText;
}

function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + chunkSize;
    
    // 尝试在句子边界切分
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('。', end);
      const lastDot = text.lastIndexOf('. ', end);
      const boundary = Math.max(lastPeriod, lastDot);
      if (boundary > start + chunkSize / 2) {
        end = boundary + 1;
      }
    }
    
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) {  // 忽略太短的片段
      chunks.push({
        text: chunk,
        start,
        end: Math.min(end, text.length)
      });
    }
    
    start = end - overlap;
    if (start >= text.length) break;
  }
  
  return chunks;
}

async function generateEmbedding(text) {
  const emb = await initEmbedder();
  const output = await emb(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function indexReport(pdfPath, reportMeta = {}) {
  console.log(`[RAG] Processing: ${path.basename(pdfPath)}`);
  
  // 提取文本
  const text = await extractTextFromPdf(pdfPath);
  console.log(`[RAG]   Extracted ${text.length} characters`);
  
  // 切片
  const chunks = chunkText(text);
  console.log(`[RAG]   Created ${chunks.length} chunks`);
  
  // 生成嵌入
  const entries = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await generateEmbedding(chunk.text);
    
    entries.push({
      id: `${path.basename(pdfPath)}-chunk-${i}`,
      source: pdfPath,
      sourceName: reportMeta.title || path.basename(pdfPath),
      organization: reportMeta.organization || 'Unknown',
      date: reportMeta.date || null,
      chunkIndex: i,
      text: chunk.text,
      embedding
    });
    
    if ((i + 1) % 10 === 0) {
      console.log(`[RAG]   Embedded ${i + 1}/${chunks.length} chunks`);
    }
  }
  
  console.log(`[RAG]   Done: ${entries.length} entries`);
  return entries;
}

async function buildIndex() {
  // 读取 reports/index.json 获取元数据
  const metaPath = path.join(REPORTS_DIR, 'index.json');
  let reportsMeta = {};
  
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    for (const report of meta.reports || []) {
      const fullPath = path.join(REPORTS_DIR, report.path);
      reportsMeta[fullPath] = report;
    }
  }
  
  // 查找所有PDF
  const findPdfs = (dir) => {
    const results = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        results.push(...findPdfs(fullPath));
      } else if (item.name.endsWith('.pdf')) {
        results.push(fullPath);
      }
    }
    return results;
  };
  
  const pdfs = findPdfs(REPORTS_DIR);
  console.log(`[RAG] Found ${pdfs.length} PDF files`);
  
  // 加载现有索引
  let existingIndex = { entries: [], indexed: {} };
  if (fs.existsSync(INDEX_FILE)) {
    existingIndex = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    console.log(`[RAG] Existing index has ${existingIndex.entries?.length || 0} entries`);
  }
  
  const indexed = existingIndex.indexed || {};
  let allEntries = existingIndex.entries || [];
  
  for (const pdf of pdfs) {
    const stat = fs.statSync(pdf);
    const mtime = stat.mtime.toISOString();
    
    // 检查是否需要重新索引
    if (indexed[pdf] === mtime) {
      console.log(`[RAG] Skipping (unchanged): ${path.basename(pdf)}`);
      continue;
    }
    
    // 移除旧条目
    allEntries = allEntries.filter(e => e.source !== pdf);
    
    // 索引
    const meta = reportsMeta[pdf] || {};
    const entries = await indexReport(pdf, meta);
    allEntries.push(...entries);
    
    indexed[pdf] = mtime;
  }
  
  // 保存索引
  const index = {
    version: 1,
    updatedAt: new Date().toISOString(),
    totalEntries: allEntries.length,
    indexed,
    entries: allEntries
  };
  
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index));
  console.log(`[RAG] Index saved: ${allEntries.length} total entries`);
  
  return index;
}

async function search(query, topK = 5) {
  if (!fs.existsSync(INDEX_FILE)) {
    throw new Error('Index not found. Run: node index-reports.mjs build');
  }
  
  const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const queryEmbedding = await generateEmbedding(query);
  
  // 计算相似度
  const results = index.entries.map(entry => ({
    ...entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding)
  }));
  
  // 排序并返回前K个
  results.sort((a, b) => b.score - a.score);
  
  return results.slice(0, topK).map(r => ({
    score: r.score.toFixed(4),
    source: r.sourceName,
    organization: r.organization,
    date: r.date,
    text: r.text.substring(0, 500) + (r.text.length > 500 ? '...' : '')
  }));
}

// CLI
const command = process.argv[2];

if (command === 'build') {
  buildIndex().then(() => {
    console.log('[RAG] Build complete');
    process.exit(0);
  }).catch(e => {
    console.error('[RAG] Error:', e.message);
    process.exit(1);
  });
} else if (command === 'search') {
  const query = process.argv.slice(3).join(' ');
  if (!query) {
    console.log('Usage: node index-reports.mjs search <query>');
    process.exit(1);
  }
  search(query).then(results => {
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  }).catch(e => {
    console.error('[RAG] Error:', e.message);
    process.exit(1);
  });
} else {
  console.log(`RAG Index Tool

Usage:
  node index-reports.mjs build              # 构建/更新索引
  node index-reports.mjs search <query>     # 搜索相关内容

Example:
  node index-reports.mjs search "委内瑞拉石油产量恢复"
`);
}

export { buildIndex, search, generateEmbedding, cosineSimilarity };
