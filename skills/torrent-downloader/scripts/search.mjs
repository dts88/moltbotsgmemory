#!/usr/bin/env node
/**
 * Jackett 搜索脚本
 * 用法: node search.mjs <关键词> [--indexer <indexer>] [--limit <数量>]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../../../.config/torrent-downloader/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help') {
  console.log('用法: node search.mjs <关键词> [--indexer <indexer>] [--limit <数量>] [--cat <类别>]');
  console.log('类别: movies, tv, music, books, software, anime');
  process.exit(0);
}

// 解析参数
let query = '';
let indexer = 'all';
let limit = 20;
let category = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--indexer' && args[i + 1]) {
    indexer = args[++i];
  } else if (args[i] === '--limit' && args[i + 1]) {
    limit = parseInt(args[++i]);
  } else if (args[i] === '--cat' && args[i + 1]) {
    category = args[++i];
  } else if (!args[i].startsWith('--')) {
    query += (query ? ' ' : '') + args[i];
  }
}

// 类别映射 (Jackett 标准类别)
const categoryMap = {
  movies: '2000',
  tv: '5000',
  music: '3000',
  books: '7000',
  software: '4000',
  anime: '5070'
};

async function search() {
  const params = new URLSearchParams({
    apikey: config.jackett.apiKey,
    Query: query,
    _: Date.now()
  });
  
  if (category && categoryMap[category]) {
    params.append('Category[]', categoryMap[category]);
  }

  const url = `${config.jackett.url}/api/v2.0/indexers/${indexer}/results?${params}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    const results = data.Results || [];
    
    // 按 Seeders 排序
    results.sort((a, b) => (b.Seeders || 0) - (a.Seeders || 0));
    
    // 格式化输出
    const output = results.slice(0, limit).map((r, i) => ({
      '#': i + 1,
      title: r.Title?.substring(0, 80) || 'N/A',
      size: formatSize(r.Size),
      seeders: r.Seeders || 0,
      leechers: r.Peers || 0,
      indexer: r.Tracker || r.TrackerId,
      magnet: r.MagnetUri || null,
      link: r.Link || null,
      guid: r.Guid
    }));
    
    console.log(JSON.stringify({ query, total: results.length, results: output }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

function formatSize(bytes) {
  if (!bytes) return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

search();
