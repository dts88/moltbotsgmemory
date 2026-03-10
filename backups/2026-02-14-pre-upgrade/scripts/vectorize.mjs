#!/usr/bin/env node
/**
 * 报告向量化脚本
 * 把 PDF 切成段落，生成 embedding，存储到 vectors.json
 * 
 * 用法: 
 *   node scripts/vectorize.mjs --all          # 向量化所有报告
 *   node scripts/vectorize.mjs --file <path>  # 向量化单个文件
 *   node scripts/vectorize.mjs --search "查询文本"  # 搜索
 */

import fs from 'fs/promises';
import path from 'path';

const REPORTS_DIR = '/home/node/clawd/reports';
const VECTORS_PATH = '/home/node/clawd/reports/vectors.json';
const INDEX_PATH = '/home/node/clawd/reports/index.json';

// 模型配置
const MODEL_NAME = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const CHUNK_SIZE = 500;  // 每段约 500 字符
const CHUNK_OVERLAP = 50;  // 段落重叠

let pipeline = null;
let extractor = null;

async function loadModel() {
  if (extractor) return extractor;
  
  console.log('Loading embedding model...');
  const { pipeline: pipelineFn } = await import('@xenova/transformers');
  extractor = await pipelineFn('feature-extraction', MODEL_NAME);
  console.log('Model loaded.');
  return extractor;
}

async function loadPdfJs() {
  const paths = [
    '/tmp/node_modules/pdfjs-dist/legacy/build/pdf.js',
    '/tmp/node_modules/pdfjs-dist/build/pdf.js'
  ];
  
  for (const pdfPath of paths) {
    try {
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      return require(pdfPath);
    } catch (e) {
      continue;
    }
  }
  throw new Error('pdfjs-dist not found');
}

async function extractPdfText(filePath) {
  const pdfjsLib = await loadPdfJs();
  const buffer = await fs.readFile(filePath);
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;
  
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
    
    // 尝试在句号、换行处断开
    if (end < text.length) {
      const searchStart = Math.max(start + chunkSize - 100, start);
      const searchEnd = Math.min(start + chunkSize + 100, text.length);
      const searchText = text.slice(searchStart, searchEnd);
      
      const breakPoints = ['. ', '。', '\n\n', '\n', '! ', '? '];
      for (const bp of breakPoints) {
        const idx = searchText.lastIndexOf(bp);
        if (idx > 0) {
          end = searchStart + idx + bp.length;
          break;
        }
      }
    }
    
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) {  // 忽略太短的段落
      chunks.push({
        text: chunk,
        start,
        end
      });
    }
    
    start = end - overlap;
    if (start >= text.length) break;
  }
  
  return chunks;
}

async function embed(text) {
  const model = await loadModel();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

async function loadVectors() {
  try {
    const data = await fs.readFile(VECTORS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return { 
      version: 1,
      model: MODEL_NAME,
      chunks: [] 
    };
  }
}

async function saveVectors(vectors) {
  await fs.writeFile(VECTORS_PATH, JSON.stringify(vectors, null, 2));
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

async function vectorizeFile(filePath, vectors) {
  const relativePath = path.relative(REPORTS_DIR, filePath);
  
  // 检查是否已向量化
  const existing = vectors.chunks.filter(c => c.source === relativePath);
  if (existing.length > 0) {
    console.log(`  Already vectorized (${existing.length} chunks), skipping`);
    return 0;
  }
  
  console.log(`  Extracting text...`);
  let text;
  try {
    text = await extractPdfText(filePath);
  } catch (e) {
    console.log(`  ⚠️ Failed to extract: ${e.message}, skipping`);
    return 0;
  }
  
  console.log(`  Chunking (${text.length} chars)...`);
  const chunks = chunkText(text);
  
  console.log(`  Embedding ${chunks.length} chunks...`);
  let count = 0;
  for (const chunk of chunks) {
    const vector = await embed(chunk.text);
    vectors.chunks.push({
      source: relativePath,
      text: chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : ''),
      fullText: chunk.text,
      vector
    });
    count++;
    process.stdout.write(`\r  Progress: ${count}/${chunks.length}`);
  }
  console.log();
  
  return count;
}

async function vectorizeAll() {
  const vectors = await loadVectors();
  
  // 读取索引获取所有报告
  const indexData = await fs.readFile(INDEX_PATH, 'utf-8');
  const index = JSON.parse(indexData);
  
  let totalChunks = 0;
  for (const report of index.reports) {
    const filePath = path.join(REPORTS_DIR, report.path);
    
    try {
      await fs.access(filePath);
    } catch (e) {
      console.log(`Skipping (not found): ${report.path}`);
      continue;
    }
    
    console.log(`\nProcessing: ${report.path}`);
    const count = await vectorizeFile(filePath, vectors);
    totalChunks += count;
  }
  
  await saveVectors(vectors);
  console.log(`\n✓ Total chunks: ${vectors.chunks.length}`);
  console.log(`✓ Saved to ${VECTORS_PATH}`);
}

async function search(query, topK = 5) {
  console.log(`Searching: "${query}"\n`);
  
  const vectors = await loadVectors();
  if (vectors.chunks.length === 0) {
    console.log('No vectors found. Run --all first.');
    return [];
  }
  
  const queryVector = await embed(query);
  
  const results = vectors.chunks.map(chunk => ({
    ...chunk,
    score: cosineSimilarity(queryVector, chunk.vector)
  }));
  
  results.sort((a, b) => b.score - a.score);
  
  const topResults = results.slice(0, topK);
  
  for (let i = 0; i < topResults.length; i++) {
    const r = topResults[i];
    console.log(`--- Result ${i + 1} (score: ${r.score.toFixed(3)}) ---`);
    console.log(`Source: ${r.source}`);
    console.log(`Text: ${r.text}\n`);
  }
  
  return topResults;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--all')) {
    await vectorizeAll();
  } else if (args.includes('--search')) {
    const idx = args.indexOf('--search');
    const query = args[idx + 1];
    if (!query) {
      console.log('Usage: --search "查询文本"');
      process.exit(1);
    }
    await search(query);
  } else if (args.includes('--file')) {
    const idx = args.indexOf('--file');
    const filePath = args[idx + 1];
    if (!filePath) {
      console.log('Usage: --file <path>');
      process.exit(1);
    }
    const vectors = await loadVectors();
    await vectorizeFile(filePath, vectors);
    await saveVectors(vectors);
  } else {
    console.log(`
报告向量化工具

用法:
  node scripts/vectorize.mjs --all            向量化所有报告
  node scripts/vectorize.mjs --file <path>    向量化单个文件
  node scripts/vectorize.mjs --search "文本"  语义搜索

模型: ${MODEL_NAME}
向量存储: ${VECTORS_PATH}
`);
  }
}

main().catch(console.error);
