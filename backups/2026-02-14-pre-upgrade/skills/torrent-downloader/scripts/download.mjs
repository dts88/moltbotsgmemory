#!/usr/bin/env node
/**
 * aria2 下载脚本
 * 用法: node download.mjs <magnet/torrent链接> [--dir <目录>]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../../../.config/torrent-downloader/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help') {
  console.log('用法: node download.mjs <magnet/torrent链接> [--dir <目录>]');
  console.log('      node download.mjs --status [gid]');
  console.log('      node download.mjs --list');
  process.exit(0);
}

let uri = '';
let dir = config.downloadDir || '/downloads';
let action = 'add';
let gid = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) {
    dir = args[++i];
  } else if (args[i] === '--status') {
    action = 'status';
    if (args[i + 1] && !args[i + 1].startsWith('--')) {
      gid = args[++i];
    }
  } else if (args[i] === '--list') {
    action = 'list';
  } else if (!args[i].startsWith('--')) {
    uri = args[i];
  }
}

async function rpc(method, params = []) {
  const body = {
    jsonrpc: '2.0',
    id: 'torrent-dl',
    method: `aria2.${method}`,
    params: [`token:${config.aria2.secret}`, ...params]
  };
  
  const res = await fetch(config.aria2.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

async function addDownload() {
  if (!uri) {
    console.error(JSON.stringify({ error: '需要提供下载链接' }));
    process.exit(1);
  }
  
  const options = { dir };
  
  let result;
  if (uri.startsWith('magnet:')) {
    result = await rpc('addUri', [[uri], options]);
  } else if (uri.endsWith('.torrent') || uri.includes('/download')) {
    // Jackett 的 torrent 下载链接
    result = await rpc('addUri', [[uri], options]);
  } else {
    result = await rpc('addUri', [[uri], options]);
  }
  
  console.log(JSON.stringify({ 
    success: true, 
    gid: result,
    message: `已添加下载任务，GID: ${result}`
  }));
}

async function getStatus(targetGid) {
  if (targetGid) {
    const status = await rpc('tellStatus', [targetGid]);
    console.log(JSON.stringify(formatStatus(status), null, 2));
  } else {
    // 获取所有活跃下载
    const active = await rpc('tellActive', []);
    const waiting = await rpc('tellWaiting', [0, 10]);
    const stopped = await rpc('tellStopped', [0, 5]);
    
    console.log(JSON.stringify({
      active: active.map(formatStatus),
      waiting: waiting.map(formatStatus),
      stopped: stopped.slice(0, 5).map(formatStatus)
    }, null, 2));
  }
}

async function listDownloads() {
  const active = await rpc('tellActive', []);
  const waiting = await rpc('tellWaiting', [0, 20]);
  
  const all = [...active, ...waiting].map(formatStatus);
  console.log(JSON.stringify({ downloads: all }, null, 2));
}

function formatStatus(s) {
  const total = parseInt(s.totalLength) || 0;
  const completed = parseInt(s.completedLength) || 0;
  const speed = parseInt(s.downloadSpeed) || 0;
  
  return {
    gid: s.gid,
    status: s.status,
    name: s.bittorrent?.info?.name || s.files?.[0]?.path?.split('/').pop() || 'Unknown',
    progress: total > 0 ? `${((completed / total) * 100).toFixed(1)}%` : '0%',
    size: formatSize(total),
    downloaded: formatSize(completed),
    speed: `${formatSize(speed)}/s`,
    seeders: s.numSeeders || 0,
    dir: s.dir
  };
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

async function main() {
  try {
    switch (action) {
      case 'add':
        await addDownload();
        break;
      case 'status':
        await getStatus(gid);
        break;
      case 'list':
        await listDownloads();
        break;
    }
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main();
