#!/usr/bin/env node
/**
 * 语音消息处理器 - 由 main session 调用
 * 读取待处理的语音消息，处理后写入回复
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const QUEUE_FILE = '/home/node/clawd/.voice-queue.json';

// 读取队列
function getQueue() {
  try {
    return JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
  } catch {
    return [];
  }
}

// 保存队列
function saveQueue(queue) {
  writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

// 获取待处理的消息
export function getPendingMessages() {
  const queue = getQueue();
  return queue.filter(m => m.status === 'pending');
}

// 标记消息已处理并写入回复
export function completeMessage(id, response) {
  const queue = getQueue();
  const msg = queue.find(m => m.id === id);
  if (msg) {
    msg.status = 'completed';
    msg.response = response;
    msg.completedAt = new Date().toISOString();
    saveQueue(queue);
    return true;
  }
  return false;
}

// CLI 模式
if (process.argv[1].endsWith('voice-handler.mjs')) {
  const action = process.argv[2];
  
  if (action === 'list') {
    const pending = getPendingMessages();
    if (pending.length === 0) {
      console.log('没有待处理的语音消息');
    } else {
      console.log('待处理的语音消息:');
      pending.forEach(m => {
        console.log(`  [${m.id}] ${m.from}: "${m.query}"`);
      });
    }
  } else if (action === 'complete') {
    const id = process.argv[3];
    const response = process.argv[4];
    if (completeMessage(id, response)) {
      console.log('已标记完成:', id);
    } else {
      console.log('未找到消息:', id);
    }
  } else {
    console.log('用法:');
    console.log('  voice-handler.mjs list              - 列出待处理消息');
    console.log('  voice-handler.mjs complete <id> <response>  - 标记完成');
  }
}
