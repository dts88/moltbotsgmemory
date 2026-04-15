#!/usr/bin/env node
/**
 * JSA Dismissal Monitor
 * - 跟踪 301 状态变化
 * - 跟踪 290-300：超过一半变橙色时告警
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const API_URL = 'https://jsa.gnsgsw.com/jsa-project-backend/public/api/group/getAllStatusTodayForDismissal';
const STATE_FILE = '/home/node/clawd/.config/jsa-dismissal-state.json';

const COLOR_MAP = {
  'completed': '🟢 绿 (Completed)',
  'ending soon': '🟠 橙 (Ending Soon)',
  'in progress': '⬜ 灰 (In Progress)',
  'ready': '⬜ 灰 (Ready)',
};

function getColor(status) {
  return COLOR_MAP[status.toLowerCase()] ?? `⬜ 灰 (${status})`;
}

function isOrange(status) {
  return status.toLowerCase() === 'ending soon';
}

async function fetchGroups() {
  const res = await fetch(API_URL, {
    headers: {
      'Authorization': 'Bearer ',
      'Accept-Language': 'en',
      'X-Platform': 'admin',
    }
  });
  const json = await res.json();
  return json.data.grouplist;
}

function loadState() {
  if (!existsSync(STATE_FILE)) return {};
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

const groups = await fetchGroups();
const state = loadState();
const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Singapore', hour12: false });

const messages = [];

// === 跟踪 301 ===
const g301 = groups.find(g => g.groupno === 301);
if (g301) {
  const prevStatus = state.status301;
  const curStatus = g301.groupstatus;
  if (prevStatus && prevStatus !== curStatus) {
    messages.push(
      `🔔 *JSA 301 状态变化！*\n` +
      `${getColor(prevStatus)} → ${getColor(curStatus)}\n` +
      `更新时间：${now}`
    );
  }
  state.status301 = curStatus;
} else {
  console.error('未找到 301 组');
}

// === 跟踪 290-300（超过一半变橙） ===
const range = groups.filter(g => g.groupno >= 290 && g.groupno <= 300);
const orangeCount = range.filter(g => isOrange(g.groupstatus)).length;
const greenCount = range.filter(g => g.groupstatus.toLowerCase() === 'completed').length;
const activeCount = orangeCount + greenCount;
const total = range.length;
const prevOrangeAlerted = state.orangeAlerted290_300 ?? false;
const halfOrMore = activeCount > total / 2;

if (halfOrMore && !prevOrangeAlerted) {
  const detail = range.map(g => {
    const icon = isOrange(g.groupstatus) ? '🟠' : g.groupstatus.toLowerCase() === 'completed' ? '🟢' : '⬜';
    return `${icon} ${g.groupno}`;
  }).join('  ');
  messages.push(
    `📊 *290-300 超过一半已橙/绿！*\n` +
    `橙色：${orangeCount} | 绿色：${greenCount} | 合计：${activeCount}/${total} 组\n` +
    `${detail}\n` +
    `时间：${now}`
  );
  state.orangeAlerted290_300 = true;
} else if (!halfOrMore) {
  // 重置告警，下次再触发
  state.orangeAlerted290_300 = false;
}

saveState(state);

if (messages.length > 0) {
  console.log('NOTIFY:' + messages.join('\n\n---\n\n'));
} else {
  // 输出当前状态供 debug
  const cur301 = g301 ? getColor(g301.groupstatus) : '未知';
  console.log(`OK: 301=${cur301} | 290-300橙+绿=${activeCount}/${total}(橙${orangeCount}/绿${greenCount}) | ${now}`);
}
