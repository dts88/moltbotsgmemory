#!/usr/bin/env node
/**
 * 将语音消息发送给 OpenClaw 处理
 * 通过 WhatsApp 触发主 session
 */

const query = process.argv[2];
const from = process.argv[3] || 'unknown';

if (!query) {
  console.error('用法: voice-to-openclaw.mjs <query> [from]');
  process.exit(1);
}

// 写入待处理队列
const fs = require('fs');
const path = require('path');

const queueFile = path.join(__dirname, '../.voice-queue.json');

let queue = [];
try {
  queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
} catch {}

queue.push({
  id: Date.now().toString(),
  timestamp: new Date().toISOString(),
  from,
  query,
  status: 'pending'
});

fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
console.log('✅ 已加入处理队列');

// 同时发送 WhatsApp 通知触发 OpenClaw
const { exec } = require('child_process');
const message = `📞 语音来电 (${from}):\n"${query}"\n\n请处理这个问题并回复。`;

// 这会触发 OpenClaw 的 WhatsApp channel
exec(`echo '${message.replace(/'/g, "\\'")}' | head -1`, (err) => {
  if (err) console.error('通知失败:', err.message);
});
