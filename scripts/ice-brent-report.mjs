#!/usr/bin/env node
/**
 * ICE Brent Daily Report - 自动登录、下载、解析、发送
 * 用法:
 *   node scripts/ice-brent-report.mjs              # 自动取最近交易日
 *   node scripts/ice-brent-report.mjs 2026-03-23   # 指定日期
 *   node scripts/ice-brent-report.mjs --parse-only /path/to/file.pdf
 *
 * 登录流程:
 *   1. 缓存 session: .config/ice/session.json (iceSsoCookie 有效期约数小时)
 *   2. 若 session 过期 → 重新登录 (需要 2FA) → 等待用户输入验证码
 *   3. 登录成功 → 下载 PDF → 解析 → 发送 WhatsApp + Telegram
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import https from 'https';
import { URLSearchParams } from 'url';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ─── 配置 ────────────────────────────────────────────────────────────────────
const CONFIG = {
  username: 'dai.tianshu@rong-sheng.com',
  password: '018982rs!',
  outputDir: path.join(ROOT, 'reports', 'ice-brent'),
  sessionFile: path.join(ROOT, '.config', 'ice', 'session.json'),
  frontMonths: 6,
};

// ─── HTTP 工具 ───────────────────────────────────────────────────────────────
function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122',
        'Accept': 'application/json, text/html, */*',
        ...options.headers,
      },
      rejectUnauthorized: false,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
        text: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── Session 管理 ────────────────────────────────────────────────────────────
function loadSession() {
  try {
    if (fs.existsSync(CONFIG.sessionFile)) {
      const s = JSON.parse(fs.readFileSync(CONFIG.sessionFile, 'utf8'));
      // cookie 有效期约 8 小时
      if (Date.now() - s.timestamp < 7 * 60 * 60 * 1000) {
        return s;
      }
    }
  } catch (e) {}
  return null;
}

function saveSession(session) {
  fs.mkdirSync(path.dirname(CONFIG.sessionFile), { recursive: true });
  fs.writeFileSync(CONFIG.sessionFile, JSON.stringify({ ...session, timestamp: Date.now() }, null, 2));
}

// ─── ICE 登录 ────────────────────────────────────────────────────────────────
async function login() {
  console.log('🔐 Step 1: 触发 2FA...');

  // 获取 SSO session
  const r0 = await request('https://sso.ice.com/appUserLogin?loginApp=ICE');
  const sess = (r0.headers['set-cookie'] || [])
    .find(c => c.includes('iceSsoJSessionId'))?.match(/iceSsoJSessionId=([^;]+)/)?.[1];
  if (!sess) throw new Error('无法获取 SSO session');

  const cookieBase = `iceSsoJSessionId=${sess}`;

  // 第一步登录 → 触发邮件发送
  const r1 = await request('https://sso.ice.com/api/authenticateTfa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Cookie': cookieBase },
  }, JSON.stringify({ userId: CONFIG.username, password: CONFIG.password, appKey: 'ICE', permissions: 'ICE' }));

  const d1 = JSON.parse(r1.text);
  const code1 = d1?.error?.code;
  if (code1 !== '-32100') throw new Error(`登录失败: ${d1?.error?.message || '未知错误'}`);

  console.log('📧 2FA 验证码已发送到邮箱，请输入：');

  // 等待验证码（从命令行参数或 stdin）
  const args = process.argv.slice(2);
  let otpCode = args.find(a => /^\d{6}$/.test(a));

  if (!otpCode) {
    // 从 stdin 读取
    otpCode = await new Promise(resolve => {
      process.stdout.write('验证码: ');
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', chunk => {
        input = chunk.trim();
        resolve(input);
      });
    });
  }

  console.log(`🔑 提交验证码: ${otpCode}`);

  // 提交验证码
  const r2 = await request('https://sso.ice.com/api/authenticateTfa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Cookie': cookieBase },
  }, JSON.stringify({
    userId: CONFIG.username, password: CONFIG.password,
    appKey: 'ICE', permissions: 'ICE', otpCode,
  }));

  // 提取 iceSsoCookie
  const setCookies = r2.headers['set-cookie'] || [];
  const iceSsoCookie = setCookies.find(c => c.includes('iceSsoCookie='))?.match(/iceSsoCookie=([^;]+)/)?.[1];
  const newSess = setCookies.find(c => c.includes('iceSsoJSessionId='))?.match(/iceSsoJSessionId=([^;]+)/)?.[1] || sess;

  const d2 = JSON.parse(r2.text);
  if (d2?.error?.code) {
    throw new Error(`2FA 失败: ${d2.error.message} (code: ${d2.error.code})`);
  }

  if (!iceSsoCookie) throw new Error('登录成功但未获取到 iceSsoCookie');

  console.log('✅ 登录成功！');
  const session = { iceSsoCookie, iceSsoJSessionId: newSess };
  saveSession(session);
  return session;
}

// ─── 建立 ice.com Report Center session ─────────────────────────────────────
async function getReportCenterCookie(session) {
  const cookies = `iceSsoCookie=${session.iceSsoCookie}; iceSsoJSessionId=${session.iceSsoJSessionId}`;
  const r = await request('https://www.ice.com/marketdata/api/reports/10/criteria', {
    headers: { 'Cookie': cookies, 'Referer': 'https://www.ice.com/report/10' },
  });
  const rcCookie = (r.headers['set-cookie'] || [])
    .find(c => c.includes('reportCenterCookie='))?.match(/reportCenterCookie=([^;]+)/)?.[1];
  return rcCookie;
}

// ─── 下载 PDF ────────────────────────────────────────────────────────────────
async function downloadReport(session, date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;

  console.log(`📥 下载报告: ${dateStr}`);

  const rcCookie = await getReportCenterCookie(session);
  const cookies = [
    `iceSsoCookie=${session.iceSsoCookie}`,
    `iceSsoJSessionId=${session.iceSsoJSessionId}`,
    rcCookie ? `reportCenterCookie=${rcCookie}` : '',
  ].filter(Boolean).join('; ');

  const body = new URLSearchParams({ exchangeCodeAndContract: 'IFEU,B', selectedDate: dateStr });

  const r = await request('https://www.ice.com/marketdata/api/reports/10/download/pdf', {
    method: 'POST',
    headers: {
      'Cookie': cookies,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': 'https://www.ice.com/report/10',
    },
  }, body.toString());

  if (r.status !== 200 || !r.headers['content-type']?.includes('pdf')) {
    throw new Error(`下载失败: HTTP ${r.status}, Content-Type: ${r.headers['content-type']}`);
  }

  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  const filename = path.join(CONFIG.outputDir, `B_${y}_${m}_${d}.pdf`);
  fs.writeFileSync(filename, r.body);
  console.log(`✅ 已保存: ${filename} (${r.body.length} bytes)`);
  return { filename, dateStr };
}

// ─── 获取可用报告列表 ────────────────────────────────────────────────────────
async function getAvailableDates(session) {
  const rcCookie = await getReportCenterCookie(session);
  const cookies = [
    `iceSsoCookie=${session.iceSsoCookie}`,
    `iceSsoJSessionId=${session.iceSsoJSessionId}`,
    rcCookie ? `reportCenterCookie=${rcCookie}` : '',
  ].filter(Boolean).join('; ');

  const body = new URLSearchParams({ exchangeCodeAndContract: 'IFEU,B' });
  const r = await request('https://www.ice.com/marketdata/api/reports/10/results', {
    method: 'POST',
    headers: { 'Cookie': cookies, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://www.ice.com/report/10' },
  }, body.toString());

  const data = JSON.parse(r.text);
  const rows = data?.datasets?.contractDates?.rows || [];
  return rows.map(row => row.reportDate).filter(Boolean);
}

// ─── PDF 解析 ────────────────────────────────────────────────────────────────
function parsePdf(pdfBuffer) {
  const streams = [];
  let pos = 0;
  while (pos < pdfBuffer.length) {
    const s1 = pdfBuffer.indexOf(Buffer.from('stream\r\n'), pos);
    const s2 = pdfBuffer.indexOf(Buffer.from('stream\n'), pos);
    let start = -1;
    if (s1 !== -1 && (s2 === -1 || s1 < s2)) start = s1 + 8;
    else if (s2 !== -1) start = s2 + 7;
    if (start === -1) break;
    const end = pdfBuffer.indexOf(Buffer.from('endstream'), start);
    if (end === -1) break;
    try { streams.push(zlib.inflateSync(pdfBuffer.slice(start, end)).toString('latin1')); } catch (e) {}
    pos = end + 9;
  }
  const allText = streams.join('\n');
  const pieces = [];
  for (const m of allText.matchAll(/\(([^)]*)\)\s*Tj/g)) pieces.push(m[1]);
  return pieces.join(' ');
}

function parseSettlements(fullText) {
  const rows = [], seen = new Set();
  const fullPat = /B\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{2})\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(-[\d.]+|[\d.]+)\s+([\d,]+)/g;
  const settlePat = /B\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{2})\s+([\d.]+)\s+(-[\d.]+)\s+([\d,]+)/g;
  for (const m of fullText.matchAll(fullPat)) {
    if (!seen.has(m[1])) { seen.add(m[1]); rows.push({ month: m[1], open: +m[2], high: +m[3], low: +m[4], close: +m[5], settle: +m[6], change: +m[7], volume: parseInt(m[8].replace(/,/g, '')) }); }
  }
  for (const m of fullText.matchAll(settlePat)) {
    if (!seen.has(m[1])) { seen.add(m[1]); rows.push({ month: m[1], open: null, high: null, low: null, close: null, settle: +m[2], change: +m[3], volume: parseInt(m[4].replace(/,/g, '')) }); }
  }
  const mo = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
  rows.sort((a, b) => {
    const [am, ay] = [a.month.slice(0,3), +a.month.slice(3)];
    const [bm, by] = [b.month.slice(0,3), +b.month.slice(3)];
    return (ay*12+mo[am])-(by*12+mo[bm]);
  });
  return rows;
}

// ─── 格式化消息 ──────────────────────────────────────────────────────────────
function formatMessage(rows, dateStr) {
  const front = rows.slice(0, CONFIG.frontMonths);
  const lines = [`🛢️ ICE Brent 结算价 (${dateStr})`, ''];
  for (const r of front) {
    const chg = (r.change >= 0 ? '+' : '') + r.change.toFixed(2);
    const emoji = r.change >= 0 ? '🔺' : '🔻';
    const range = r.high ? `  (${r.low.toFixed(2)}-${r.high.toFixed(2)})` : '';
    lines.push(`*${r.month}*  $${r.settle.toFixed(2)}  ${emoji}${chg}${range}`);
  }
  lines.push('');
  if (rows.length >= 2) lines.push(`M1-M2: ${(rows[0].settle-rows[1].settle>=0?'+':'') + (rows[0].settle-rows[1].settle).toFixed(2)} $/bbl`);
  if (rows.length >= 6) lines.push(`M1-M6: ${(rows[0].settle-rows[5].settle>=0?'+':'') + (rows[0].settle-rows[5].settle).toFixed(2)} $/bbl`);
  lines.push('');
  lines.push(`总成交量: ${rows.reduce((s,r)=>s+r.volume,0).toLocaleString()} 手  |  ${rows.length} 个合约月`);
  lines.push('来源: ICE Futures Europe');
  return lines.join('\n');
}

// ─── 主函数 ─────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  // --parse-only 模式
  if (args[0] === '--parse-only') {
    const pdfPath = args[1];
    if (!pdfPath || !fs.existsSync(pdfPath)) throw new Error(`文件不存在: ${pdfPath}`);
    const rows = parseSettlements(parsePdf(fs.readFileSync(pdfPath)));
    const dateStr = path.basename(pdfPath).match(/(\d{4}_\d{2}_\d{2})/)?.[1]?.replace(/_/g, '-') || 'unknown';
    console.log(formatMessage(rows, dateStr));
    return;
  }

  // --list-dates 模式
  if (args[0] === '--list-dates') {
    const session = loadSession() || await login();
    const dates = await getAvailableDates(session);
    console.log('可用报告日期:');
    dates.forEach(d => console.log(' ', d));
    return;
  }

  // 确定目标日期
  let targetDate;
  if (args[0]?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = args[0].split('-').map(Number);
    targetDate = new Date(y, m-1, d);
  } else {
    // 默认：最近交易日（昨天，跳过周末）
    targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 1);
    while (targetDate.getDay() === 0 || targetDate.getDay() === 6) {
      targetDate.setDate(targetDate.getDate() - 1);
    }
  }

  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth()+1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;
  const pdfPath = path.join(CONFIG.outputDir, `B_${y}_${m}_${d}.pdf`);

  console.log(`📅 目标日期: ${dateStr}`);

  // 下载 PDF（如果还没有）
  if (!fs.existsSync(pdfPath)) {
    const session = loadSession() || await login();
    await downloadReport(session, targetDate);
  } else {
    console.log(`📄 使用已有文件: ${pdfPath}`);
  }

  // 解析
  console.log('📊 解析 PDF...');
  const rows = parseSettlements(parsePdf(fs.readFileSync(pdfPath)));
  if (rows.length === 0) throw new Error('未解析到合约数据');
  console.log(`✅ ${rows.length} 个合约月`);

  const message = formatMessage(rows, dateStr);

  // 保存 JSON
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  fs.writeFileSync(pdfPath.replace('.pdf', '.json'), JSON.stringify({ date: dateStr, rows }, null, 2));

  // 输出消息
  console.log('\n' + '─'.repeat(50));
  console.log(message);
  console.log('─'.repeat(50));

  // 返回供外部调用
  return { message, rows, pdfPath };
}

// 导出供 cron 调用
export { main, formatMessage, parseSettlements, parsePdf, loadSession, saveSession, login };

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
