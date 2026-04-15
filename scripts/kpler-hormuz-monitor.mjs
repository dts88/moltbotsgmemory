#!/usr/bin/env node
/**
 * Kpler Strait of Hormuz Crossings Monitor
 * 每8小时检查一次，发现新文件时下载并提醒
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const HORMUZ_DIR = join(WORKSPACE, 'reports/hormuz');
const STATE_FILE = join(HORMUZ_DIR, 'state.json');
const PAGE_URL = 'https://help.kpler.com/en/articles/14012671-strait-of-hormuz-transit-identification';

if (!existsSync(HORMUZ_DIR)) mkdirSync(HORMUZ_DIR, { recursive: true });

function loadState() {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch (e) {}
  return { lastFileLabel: null, lastUrl: null };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchPage() {
  const res = await fetch(PAGE_URL, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function extractDownloadLink(html) {
  // 匹配下载链接
  const match = html.match(/href="(https:\/\/download\.kpler\.com\/[^"]+\.xlsx)"/i);
  if (!match) return null;
  const url = match[1];
  // 从URL提取文件标签（解码）
  const decoded = decodeURIComponent(url.split('/').pop().replace('.xlsx', '').replace(' - Kpler SoH Crossings', '').trim());
  return { url, label: decoded };
}

async function downloadFile(url, label) {
  const filename = `Kpler_SoH_Crossings_${label.replace(/[: /]/g, '_')}.xlsx`;
  const dest = join(HORMUZ_DIR, filename);

  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  writeFileSync(dest, Buffer.from(buf));
  return { filename, path: dest, sizeKb: Math.round(buf.byteLength / 1024) };
}

async function main() {
  const state = loadState();

  let html;
  try {
    html = await fetchPage();
  } catch (e) {
    console.log(JSON.stringify({ status: 'ERROR', message: `页面获取失败: ${e.message}` }));
    process.exit(1);
  }

  const link = extractDownloadLink(html);
  if (!link) {
    console.log(JSON.stringify({ status: 'ERROR', message: '未找到下载链接' }));
    process.exit(1);
  }

  // 检查是否有更新
  if (link.url === state.lastUrl) {
    console.log(JSON.stringify({ status: 'NO_UPDATE', lastFile: state.lastFileLabel }));
    process.exit(0);
  }

  // 有新文件，下载
  let fileInfo;
  try {
    fileInfo = await downloadFile(link.url, link.label);
  } catch (e) {
    console.log(JSON.stringify({ status: 'ERROR', message: `下载失败: ${e.message}` }));
    process.exit(1);
  }

  // 更新 state
  saveState({ lastFileLabel: link.label, lastUrl: link.url, lastUpdated: new Date().toISOString() });

  console.log(JSON.stringify({
    status: 'NEW_FILE',
    label: link.label,
    filename: fileInfo.filename,
    path: fileInfo.path,
    sizeKb: fileInfo.sizeKb,
    url: link.url
  }));
}

main().catch(e => {
  console.log(JSON.stringify({ status: 'ERROR', message: e.message }));
  process.exit(1);
});
