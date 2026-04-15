#!/usr/bin/env node
/**
 * ICE Brent 日报 Cron 入口
 * 每天新加坡时间 04:30 运行（伦敦夏令时后改为 03:30）
 * 下载报告 → 解析 → 发送 WhatsApp + Telegram
 */

import { main, loadSession } from './ice-brent-report.mjs';
import { execSync } from 'child_process';
import fs from 'fs';

async function run() {
  console.log('=== ICE Brent 日报 Cron ===', new Date().toISOString());

  // 检查 session 是否有效
  const session = loadSession();
  if (!session) {
    const msg = '⚠️ ICE Brent 日报：session 已过期，需要重新登录（2FA）。请运行: node scripts/ice-brent-report.mjs';
    // 通过 OpenClaw 发送告警
    process.env.OPENCLAW_NOTIFY = msg;
    console.error(msg);
    process.exit(2); // 特殊退出码，cron delivery 会捕获
  }

  try {
    const result = await main();
    if (!result) { console.log('无新报告'); return; }

    const { message, pdfPath } = result;

    // 发送到 WhatsApp（通过 OpenClaw 标准输出，cron delivery 会处理）
    console.log('OPENCLAW_MESSAGE:' + message);
    console.log('OPENCLAW_PDF:' + pdfPath);

    // 也写入临时文件供 cron payload 读取
    fs.writeFileSync('/tmp/ice_brent_result.json', JSON.stringify({ message, pdfPath }));

  } catch (err) {
    console.error('❌ 失败:', err.message);
    process.exit(1);
  }
}

run();
