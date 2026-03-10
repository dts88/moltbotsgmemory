#!/usr/bin/env node
/**
 * Usage Tracker - 跟踪每个用户的 API/服务用量
 * 
 * 用法:
 *   import { trackUsage, getUsage, getUserSummary } from './usage-tracker.mjs';
 *   
 *   // 记录用量
 *   trackUsage('8438057858', 'twitter', { action: 'search', query: '@JavierBlas' });
 *   trackUsage('8438057858', 'eia', { action: 'query', endpoint: 'crude-stocks' });
 *   
 *   // 查询用量
 *   getUsage({ userId: '8438057858', service: 'twitter', days: 7 });
 *   getUserSummary('8438057858');
 *   
 * CLI:
 *   node scripts/usage-tracker.mjs summary [userId]
 *   node scripts/usage-tracker.mjs report [days]
 *   node scripts/usage-tracker.mjs detail <userId> [service] [days]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USAGE_DIR = path.join(__dirname, '../.config/usage');
const USAGE_FILE = path.join(USAGE_DIR, 'usage-log.jsonl');
const LIMITS_FILE = path.join(USAGE_DIR, 'limits.json');

// 确保目录存在
if (!fs.existsSync(USAGE_DIR)) {
  fs.mkdirSync(USAGE_DIR, { recursive: true });
}

// 服务定义及已知限制
const SERVICE_LIMITS = {
  claude: {
    name: 'Claude API',
    unit: 'tokens',
    notes: 'Anthropic API usage, billed per token'
  },
  twitter: {
    name: 'Twitter/X Search',
    unit: 'requests',
    notes: 'Cookie auth, shared credential, rate-limited',
    dailyLimit: 100  // 保守估计
  },
  eia: {
    name: 'EIA Data API',
    unit: 'requests',
    notes: 'Free API key, 1000 req/hour',
    hourlyLimit: 1000
  },
  platts: {
    name: 'Platts API',
    unit: 'requests',
    notes: 'Token auth, 60min expiry, shared token'
  },
  'platts-heards': {
    name: 'Platts Structured Heards',
    unit: 'requests',
    notes: 'Part of Platts API quota'
  },
  'web-search': {
    name: 'Brave Web Search',
    unit: 'requests',
    notes: 'Brave API key'
  },
  'web-fetch': {
    name: 'Web Fetch',
    unit: 'requests',
    notes: 'URL content extraction'
  },
  polymarket: {
    name: 'Polymarket API',
    unit: 'requests',
    notes: 'Public API, no auth required'
  }
};

/**
 * 记录一次用量
 */
export function trackUsage(userId, service, details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    userId: String(userId),
    service,
    ...details
  };
  
  try {
    fs.appendFileSync(USAGE_FILE, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error('Usage tracking error:', e.message);
  }
  
  return entry;
}

/**
 * 读取用量日志
 */
function readLog(filters = {}) {
  if (!fs.existsSync(USAGE_FILE)) return [];
  
  const lines = fs.readFileSync(USAGE_FILE, 'utf8').trim().split('\n').filter(Boolean);
  let entries = lines.map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  
  // 时间过滤
  if (filters.days) {
    const cutoff = new Date(Date.now() - filters.days * 86400000).toISOString();
    entries = entries.filter(e => e.ts >= cutoff);
  }
  if (filters.since) {
    entries = entries.filter(e => e.ts >= filters.since);
  }
  
  // 用户过滤
  if (filters.userId) {
    entries = entries.filter(e => e.userId === String(filters.userId));
  }
  
  // 服务过滤
  if (filters.service) {
    entries = entries.filter(e => e.service === filters.service);
  }
  
  return entries;
}

/**
 * 获取用量统计
 */
export function getUsage(filters = {}) {
  const entries = readLog(filters);
  
  // 按服务分组计数
  const byService = {};
  for (const e of entries) {
    if (!byService[e.service]) {
      byService[e.service] = { count: 0, entries: [] };
    }
    byService[e.service].count++;
    byService[e.service].entries.push(e);
  }
  
  return { total: entries.length, byService };
}

/**
 * 获取用户汇总
 */
export function getUserSummary(userId, days = 30) {
  const entries = readLog({ userId, days });
  
  const summary = {
    userId,
    period: `${days} days`,
    totalRequests: entries.length,
    services: {}
  };
  
  for (const e of entries) {
    if (!summary.services[e.service]) {
      summary.services[e.service] = {
        name: SERVICE_LIMITS[e.service]?.name || e.service,
        count: 0,
        lastUsed: null
      };
    }
    summary.services[e.service].count++;
    const ts = e.ts;
    if (!summary.services[e.service].lastUsed || ts > summary.services[e.service].lastUsed) {
      summary.services[e.service].lastUsed = ts;
    }
  }
  
  return summary;
}

/**
 * 获取全局报告
 */
export function getReport(days = 7) {
  const entries = readLog({ days });
  
  // 按用户分组
  const byUser = {};
  for (const e of entries) {
    const uid = e.userId || 'system';
    if (!byUser[uid]) byUser[uid] = {};
    if (!byUser[uid][e.service]) byUser[uid][e.service] = 0;
    byUser[uid][e.service]++;
  }
  
  // 按服务分组（全局）
  const byService = {};
  for (const e of entries) {
    if (!byService[e.service]) byService[e.service] = 0;
    byService[e.service]++;
  }
  
  // 今日用量
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEntries = entries.filter(e => e.ts >= todayStart.toISOString());
  const todayByService = {};
  for (const e of todayEntries) {
    if (!todayByService[e.service]) todayByService[e.service] = 0;
    todayByService[e.service]++;
  }
  
  return {
    period: `${days} days`,
    totalRequests: entries.length,
    todayRequests: todayEntries.length,
    byUser,
    byService,
    todayByService,
    limits: SERVICE_LIMITS
  };
}

/**
 * 检查是否接近限制
 */
export function checkLimits(userId) {
  const warnings = [];
  const now = new Date();
  
  // 检查每小时限制
  const hourAgo = new Date(now - 3600000).toISOString();
  const hourEntries = readLog({ userId, since: hourAgo });
  
  for (const [svc, limit] of Object.entries(SERVICE_LIMITS)) {
    if (limit.hourlyLimit) {
      const count = hourEntries.filter(e => e.service === svc).length;
      if (count >= limit.hourlyLimit * 0.8) {
        warnings.push({
          service: svc,
          type: 'hourly',
          current: count,
          limit: limit.hourlyLimit,
          pct: Math.round(count / limit.hourlyLimit * 100)
        });
      }
    }
  }
  
  // 检查每日限制
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const dayEntries = readLog({ userId, since: todayStart.toISOString() });
  
  for (const [svc, limit] of Object.entries(SERVICE_LIMITS)) {
    if (limit.dailyLimit) {
      const count = dayEntries.filter(e => e.service === svc).length;
      if (count >= limit.dailyLimit * 0.8) {
        warnings.push({
          service: svc,
          type: 'daily',
          current: count,
          limit: limit.dailyLimit,
          pct: Math.round(count / limit.dailyLimit * 100)
        });
      }
    }
  }
  
  return warnings;
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('usage-tracker.mjs')) {
  const cmd = process.argv[2] || 'report';
  
  if (cmd === 'summary') {
    const userId = process.argv[3];
    if (userId) {
      console.log(JSON.stringify(getUserSummary(userId), null, 2));
    } else {
      // All users
      const entries = readLog({ days: 30 });
      const users = [...new Set(entries.map(e => e.userId))];
      for (const uid of users) {
        const s = getUserSummary(uid);
        console.log(`\n=== User: ${uid} ===`);
        console.log(`Total: ${s.totalRequests} requests (${s.period})`);
        for (const [svc, info] of Object.entries(s.services)) {
          console.log(`  ${info.name}: ${info.count} | last: ${info.lastUsed}`);
        }
      }
      if (users.length === 0) console.log('No usage data yet.');
    }
  } else if (cmd === 'report') {
    const days = parseInt(process.argv[3]) || 7;
    const report = getReport(days);
    console.log(`\n📊 Usage Report (${report.period})`);
    console.log(`Total: ${report.totalRequests} requests | Today: ${report.todayRequests}`);
    console.log('\nBy Service:');
    for (const [svc, count] of Object.entries(report.byService).sort((a, b) => b[1] - a[1])) {
      const name = SERVICE_LIMITS[svc]?.name || svc;
      console.log(`  ${name}: ${count}`);
    }
    console.log('\nBy User:');
    for (const [uid, services] of Object.entries(report.byUser)) {
      const total = Object.values(services).reduce((a, b) => a + b, 0);
      console.log(`  ${uid}: ${total} total`);
      for (const [svc, count] of Object.entries(services)) {
        console.log(`    ${svc}: ${count}`);
      }
    }
  } else if (cmd === 'detail') {
    const userId = process.argv[3];
    const service = process.argv[4];
    const days = parseInt(process.argv[5]) || 7;
    const entries = readLog({ userId, service, days });
    for (const e of entries.slice(-50)) {
      console.log(`${e.ts} | ${e.service} | ${JSON.stringify(e)}`);
    }
  } else if (cmd === 'limits') {
    const userId = process.argv[3] || 'all';
    const warnings = checkLimits(userId === 'all' ? undefined : userId);
    if (warnings.length === 0) {
      console.log('✅ All within limits');
    } else {
      for (const w of warnings) {
        console.log(`⚠️ ${w.service}: ${w.current}/${w.limit} (${w.pct}%) ${w.type}`);
      }
    }
  } else {
    console.log('Usage: node usage-tracker.mjs [summary|report|detail|limits] [args...]');
  }
}
