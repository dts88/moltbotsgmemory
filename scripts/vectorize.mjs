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
const SOURCES_PATH = '/home/node/clawd/reports/vectorized-sources.json';
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
    '/tmp/node_modules/pdfjs-dist/legacy/build/pdf.mjs',
    '/tmp/node_modules/pdfjs-dist/build/pdf.mjs'
  ];
  
  for (const pdfPath of paths) {
    try {
      return await import(pdfPath);
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

// 只加载已处理文件列表（轻量）
async function loadProcessedSources() {
  try {
    const data = await fs.readFile(SOURCES_PATH, 'utf-8');
    return new Set(JSON.parse(data));
  } catch (e) {
    return new Set();
  }
}

// 保存已处理文件列表
async function saveProcessedSources(sources) {
  await fs.writeFile(SOURCES_PATH, JSON.stringify([...sources], null, 2));
}

// 追加新 chunks 到文件（不重写整个文件）
async function appendChunks(newChunks) {
  const { createWriteStream, existsSync } = await import('fs');
  const exists = existsSync(VECTORS_PATH);
  
  if (!exists || (await fs.stat(VECTORS_PATH)).size < 100) {
    // 新文件，写完整结构
    const stream = createWriteStream(VECTORS_PATH);
    return new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('finish', resolve);
      stream.write('{\n');
      stream.write(`  "version": 1,\n`);
      stream.write(`  "model": ${JSON.stringify(MODEL_NAME)},\n`);
      stream.write('  "chunks": [\n');
      for (let i = 0; i < newChunks.length; i++) {
        const comma = i < newChunks.length - 1 ? ',' : '';
        stream.write(`    ${JSON.stringify(newChunks[i])}${comma}\n`);
      }
      stream.write('  ]\n}\n');
      stream.end();
    });
  }
  
  // 追加到现有文件：先读取末尾，修改 ] 为 ,
  const fd = await fs.open(VECTORS_PATH, 'r+');
  const stat = await fd.stat();
  
  // 找到最后的 ] 位置（跳过末尾的 ]\n}\n）
  const tailSize = 10;
  const tailBuf = Buffer.alloc(tailSize);
  await fd.read(tailBuf, 0, tailSize, stat.size - tailSize);
  const tailStr = tailBuf.toString();
  
  // 定位到 ] 前面
  let insertPos = stat.size - tailSize + tailStr.lastIndexOf(']') - 1;
  
  // 构建要追加的内容
  let appendData = '';
  for (let i = 0; i < newChunks.length; i++) {
    appendData += `,\n    ${JSON.stringify(newChunks[i])}`;
  }
  appendData += '\n  ]\n}\n';
  
  // 写入
  await fd.write(appendData, insertPos);
  await fd.close();
}

async function loadVectors() {
  // 返回轻量对象，不加载全部 chunks
  return { 
    version: 1,
    model: MODEL_NAME,
    chunks: [],
    processedSources: await loadProcessedSources()
  };
}

async function saveVectors(vectors) {
  // 流式写入，避免 JSON.stringify 超出字符串限制
  const { createWriteStream } = await import('fs');
  const stream = createWriteStream(VECTORS_PATH);
  
  return new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('finish', resolve);
    
    // 写入开头
    stream.write('{\n');
    stream.write(`  "version": ${vectors.version},\n`);
    stream.write(`  "model": ${JSON.stringify(vectors.model)},\n`);
    stream.write('  "chunks": [\n');
    
    // 逐个写入 chunk
    const chunks = vectors.chunks;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const json = JSON.stringify(chunk);
      const comma = i < chunks.length - 1 ? ',' : '';
      stream.write(`    ${json}${comma}\n`);
    }
    
    // 写入结尾
    stream.write('  ]\n');
    stream.write('}\n');
    stream.end();
  });
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

async function vectorizeFile(filePath, processedSources) {
  const relativePath = path.relative(REPORTS_DIR, filePath);
  
  // 检查是否已向量化（用轻量索引）
  if (processedSources.has(relativePath)) {
    console.log(`  Already vectorized, skipping`);
    return { count: 0, chunks: [] };
  }
  
  console.log(`  Extracting text...`);
  let text;
  try {
    text = await extractPdfText(filePath);
  } catch (e) {
    console.log(`  ⚠️ Failed to extract: ${e.message}, skipping`);
    return { count: 0, chunks: [] };
  }
  
  console.log(`  Chunking (${text.length} chars)...`);
  const textChunks = chunkText(text);
  
  console.log(`  Embedding ${textChunks.length} chunks...`);
  const newChunks = [];
  let count = 0;
  for (const chunk of textChunks) {
    const vector = await embed(chunk.text);
    newChunks.push({
      source: relativePath,
      text: chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : ''),
      fullText: chunk.text,
      vector
    });
    count++;
    process.stdout.write(`\r  Progress: ${count}/${textChunks.length}`);
  }
  console.log();
  
  return { count, chunks: newChunks };
}

async function vectorizeAll() {
  const processedSources = await loadProcessedSources();
  console.log(`Already processed: ${processedSources.size} files`);
  
  // 读取索引获取所有报告
  const indexData = await fs.readFile(INDEX_PATH, 'utf-8');
  const index = JSON.parse(indexData);
  
  let totalNew = 0;
  let allNewChunks = [];
  
  for (const report of index.reports) {
    const filePath = path.join(REPORTS_DIR, report.path);
    
    try {
      await fs.access(filePath);
    } catch (e) {
      console.log(`Skipping (not found): ${report.path}`);
      continue;
    }
    
    console.log(`\nProcessing: ${report.path}`);
    const { count, chunks } = await vectorizeFile(filePath, processedSources);
    
    if (count > 0) {
      allNewChunks.push(...chunks);
      processedSources.add(report.path);
      totalNew += count;
      
      // 每处理 5 个新文件保存一次（防止中断丢失）
      if (allNewChunks.length > 500) {
        console.log(`\n  Saving batch (${allNewChunks.length} chunks)...`);
        await appendChunks(allNewChunks);
        await saveProcessedSources(processedSources);
        allNewChunks = [];
      }
    }
  }
  
  // 保存剩余的
  if (allNewChunks.length > 0) {
    console.log(`\nSaving final batch (${allNewChunks.length} chunks)...`);
    await appendChunks(allNewChunks);
    await saveProcessedSources(processedSources);
  }
  
  console.log(`\n✓ New chunks added: ${totalNew}`);
  console.log(`✓ Total files processed: ${processedSources.size}`);
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
