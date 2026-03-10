#!/usr/bin/env node
/**
 * Platts Structured Heards API
 * 
 * 结构化交易信息抓取 - 包含价格、货量、品种、装期等字段
 * 
 * 用法：
 *   node scripts/platts-structured-heards.mjs markets              # 列出所有市场
 *   node scripts/platts-structured-heards.mjs metadata             # 查看字段定义
 *   node scripts/platts-structured-heards.mjs heards <market>      # 获取交易信息
 *   node scripts/platts-structured-heards.mjs heards <market> --type=trade
 *   node scripts/platts-structured-heards.mjs heards <market> --days=7
 *   node scripts/platts-structured-heards.mjs export <market>      # 导出 JSON
 *   node scripts/platts-structured-heards.mjs table <market>       # 表格格式输出
 * 
 * 可用市场 (2026-02):
 *   "Americas crude oil"  - 美洲原油 (最完整，有volume)
 *   "Asia crude oil"      - 亚洲原油
 *   "EMEA crude oil"      - 欧洲/中东/非洲原油
 *   "Platts Carbon"       - 碳信用
 * 
 * 关键字段:
 *   heard_type: Trade/Bid/Offer/Indicative value
 *   grade: 油种 (WTI MEH, Mars, Basrah Medium...)
 *   price: 价格差 (+0.95, -1.00...)
 *   pricing_basis: 基准 (Dated Brent, WTI...)
 *   volume: 货量 (30,000 bbl...)
 *   laycan: 装期 (March, April...)
 *   location: 位置
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CONFIG_FILE = join(WORKSPACE, '.config/spglobal/credentials.json');
const OUTPUT_DIR = join(WORKSPACE, 'reports/structured-heards');

const BASE_URL = 'https://api.platts.com';
const ENDPOINT = 'structured-heards/v1';

// ===== 认证 =====

function loadCredentials() {
  if (!existsSync(CONFIG_FILE)) {
    throw new Error('Platts credentials not found. Run platts-login.mjs first.');
  }
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
}

function isTokenExpired(creds) {
  if (!creds.expires_at) return true;
  const expiresAt = new Date(creds.expires_at).getTime();
  const now = Date.now();
  return now >= expiresAt - 60000; // 1分钟缓冲
}

// ===== API 请求 =====

async function apiRequest(path, params = {}) {
  const creds = loadCredentials();
  
  if (isTokenExpired(creds)) {
    console.error('❌ Token 已过期，请重新登录：');
    console.error('   node scripts/platts-login.mjs <username> <password>');
    process.exit(1);
  }
  
  const url = new URL(`${BASE_URL}/${ENDPOINT}/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.append(k, v);
    }
  });
  
  console.error(`[API] GET ${url.pathname}${url.search}`);
  
  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${creds.access_token}`,
      'Accept': 'application/json',
      'User-Agent': 'moltbot/1.0'
    }
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API Error ${response.status}: ${text}`);
  }
  
  return response.json();
}

// ===== 分页获取 =====

async function fetchAllPages(path, params = {}, maxPages = 10) {
  const allResults = [];
  let page = 1;
  let totalPages = 1;
  
  do {
    const data = await apiRequest(path, { ...params, page, pageSize: 1000 });
    
    if (data.results) {
      allResults.push(...data.results);
    }
    
    if (data.metadata) {
      totalPages = data.metadata.total_pages || data.metadata.totalPages || 1;
    }
    
    console.error(`  Page ${page}/${totalPages}, got ${data.results?.length || 0} items`);
    page++;
    
  } while (page <= totalPages && page <= maxPages);
  
  if (page > maxPages && page <= totalPages) {
    console.error(`  ⚠️ 限制在 ${maxPages} 页，共 ${totalPages} 页`);
  }
  
  return allResults;
}

// ===== 命令：markets =====

async function cmdMarkets() {
  console.error('\n📊 获取 Structured Heards 市场列表...\n');
  
  const results = await fetchAllPages('markets');
  
  console.log('\n=== 可用市场 ===\n');
  
  results.forEach(market => {
    console.log(`• ${market.market} (${market.attributes?.length || 0} 字段)`);
    // 显示关键字段
    const keyAttrs = ['buyer', 'seller', 'price', 'volume', 'grade', 'laycan', 'location'];
    const available = keyAttrs.filter(a => market.attributes?.includes(a));
    if (available.length > 0) {
      console.log(`  关键字段: ${available.join(', ')}`);
    }
  });
  
  console.log(`\n共 ${results.length} 个市场\n`);
  
  return results;
}

// ===== 命令：metadata =====

async function cmdMetadata() {
  console.error('\n📋 获取字段元数据...\n');
  
  const data = await apiRequest('metadata');
  
  console.log('=== Structured Heards 字段定义 ===\n');
  
  // 按类别分组
  const categories = {
    '交易信息': ['heard_type', 'buyer', 'seller', 'price', 'volume', 'date_of_activity'],
    '品种/规格': ['grade', 'commodity', 'brand', 'quality_labels'],
    '价格相关': ['price', 'pricing_basis', 'currency', 'uom', 'price_qualifier_1', 'price_qualifier_2', 'price_qualifier_3'],
    '数量相关': ['volume', 'volume_uom', 'volume_quantity_unit', 'minimum_volume', 'maximum_volume'],
    '时间/位置': ['laycan', 'location', 'geography', 'incoterm', 'delivery'],
    '元数据': ['id', 'headline', 'body', 'updatedDate', 'rtpTimestamp']
  };
  
  const allFields = data.results?.Article || [];
  
  Object.entries(categories).forEach(([cat, fields]) => {
    console.log(`\n【${cat}】`);
    fields.forEach(f => {
      const fieldDef = allFields.find(af => af.field === f);
      if (fieldDef) {
        const flags = [];
        if (fieldDef.isFilterField) flags.push('可过滤');
        if (fieldDef.isQueryField) flags.push('可搜索');
        console.log(`  • ${f} [${fieldDef.type}] ${flags.join(' ')}`);
        if (fieldDef.description) {
          console.log(`    ${fieldDef.description.substring(0, 60)}...`);
        }
      }
    });
  });
  
  console.log(`\n共 ${allFields.length} 个字段定义`);
  
  return data;
}

// ===== 命令：heards =====

async function cmdHeards(market, options = {}) {
  const { type, days, commodity, geography, location } = options;
  
  console.error(`\n📰 获取 ${market} 交易信息...\n`);
  
  // 构建 filter
  const filters = [`market:"${market}"`];
  
  if (type) {
    filters.push(`heard_type:"${type}"`);
  }
  if (commodity) {
    filters.push(`commodity:"${commodity}"`);
  }
  if (geography) {
    filters.push(`geography:"${geography}"`);
  }
  if (location) {
    filters.push(`location:"${location}"`);
  }
  
  const params = {
    filter: filters.join(' AND ')
  };
  
  // 日期过滤
  if (days) {
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));
    params.filter += ` AND updatedDate>="${since.toISOString().split('T')[0]}"`;
  }
  
  const results = await fetchAllPages('data', params);
  
  console.log(`\n=== ${market} 交易信息 ===\n`);
  console.log(`共 ${results.length} 条记录\n`);
  
  // 显示前10条
  results.slice(0, 10).forEach((item, i) => {
    console.log(`--- ${i + 1} ---`);
    console.log(`类型: ${item.heard_type || item.heardType || '-'}`);
    console.log(`商品: ${item.commodity || '-'}`);
    console.log(`地区: ${item.geography || '-'}`);
    console.log(`位置: ${item.location || '-'}`);
    console.log(`更新: ${item.updatedDate || item.rtpTimestamp || '-'}`);
    
    // 显示所有其他字段
    const skipFields = ['heard_type', 'heardType', 'commodity', 'geography', 'location', 'updatedDate', 'rtpTimestamp', 'market'];
    const otherFields = Object.entries(item).filter(([k]) => !skipFields.includes(k));
    otherFields.forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') {
        const display = typeof v === 'object' ? JSON.stringify(v) : v;
        console.log(`${k}: ${display}`);
      }
    });
    console.log();
  });
  
  if (results.length > 10) {
    console.log(`... 还有 ${results.length - 10} 条记录\n`);
  }
  
  return results;
}

// ===== 命令：table (表格输出) =====

async function cmdTable(market, options = {}) {
  const { type, days, limit = 20, grade } = options;
  
  console.error(`\n📊 ${market} 交易表格...\n`);
  
  const filters = [`market:"${market}"`];
  if (type) filters.push(`heard_type:"${type}"`);
  if (grade) filters.push(`grade:"${grade}"`);
  
  const params = { filter: filters.join(' AND '), pageSize: parseInt(limit) };
  
  if (days) {
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));
    params.filter += ` AND updatedDate>="${since.toISOString().split('T')[0]}"`;
  }
  
  const data = await apiRequest('data', params);
  
  if (!data.results || data.results.length === 0) {
    console.log('无数据');
    return;
  }
  
  // 根据市场类型选择表格格式
  const isCarbon = market.toLowerCase().includes('carbon');
  const isAmericas = market.toLowerCase().includes('americas');
  
  if (isCarbon) {
    // 碳市场表格
    console.log(`| 类型 | 项目类型 | 价格 | 货量 | 认证标准 | 年份 | 日期 |`);
    console.log(`|------|----------|------|------|----------|------|------|`);
    data.results.forEach(item => {
      console.log(`| ${[
        item.heard_type || '-',
        (item.credit_type || '-').substring(0, 14),
        item.price || '-',
        item.volume || '-',
        (item.certification_and_standards || '-').substring(0, 12),
        item.vintage || '-',
        item.updatedDate?.split('T')[0] || '-'
      ].join(' | ')} |`);
    });
  } else if (isAmericas) {
    // 美洲原油 (有 volume)
    console.log(`| 类型 | 品种 | 价格 | 基准 | 货量 | 装期 | 位置 | 日期 |`);
    console.log(`|------|------|------|------|------|------|------|------|`);
    data.results.forEach(item => {
      console.log(`| ${[
        item.heard_type || '-',
        (item.grade || '-').substring(0, 16),
        item.price || '-',
        (item.pricing_basis || '-').substring(0, 10),
        item.volume || '-',
        item.laycan || '-',
        (item.location || '-').substring(0, 10),
        item.updatedDate?.split('T')[0] || '-'
      ].join(' | ')} |`);
    });
  } else {
    // 亚洲/EMEA 原油
    console.log(`| 类型 | 品种 | 价格 | 基准 | 装期 | 位置 | 日期 |`);
    console.log(`|------|------|------|------|------|------|------|`);
    data.results.forEach(item => {
      console.log(`| ${[
        item.heard_type || '-',
        (item.grade || '-').substring(0, 18),
        item.price || '-',
        (item.pricing_basis || '-').substring(0, 12),
        item.laycan || '-',
        (item.location || '-').substring(0, 12),
        item.updatedDate?.split('T')[0] || '-'
      ].join(' | ')} |`);
    });
  }
  
  console.log(`\n共 ${data.metadata?.count || data.results.length} 条记录`);
  
  return data.results;
}

// ===== 解析字段（提取结构化数据）=====

function parseHeardFields(heard) {
  return {
    id: heard.id,
    type: heard.heard_type,
    market: heard.market,
    commodity: heard.commodity,
    geography: heard.geography,
    location: heard.location,
    
    // 交易字段
    buyer: heard.buyer,
    seller: heard.seller,
    price: heard.price,
    priceQualifier: [heard.price_qualifier_1, heard.price_qualifier_2, heard.price_qualifier_3].filter(Boolean).join(' '),
    currency: heard.currency,
    uom: heard.uom,
    pricingBasis: heard.pricing_basis,
    
    // 数量
    volume: heard.volume,
    volumeUom: heard.volume_uom,
    minVolume: heard.minimum_volume,
    maxVolume: heard.maximum_volume,
    
    // 品种/规格
    grade: heard.grade,
    incoterm: heard.incoterm,
    laycan: heard.laycan,
    
    // 时间
    dateOfActivity: heard.date_of_activity,
    updatedDate: heard.updatedDate,
    rtpTimestamp: heard.rtpTimestamp,
    
    // 内容
    headline: heard.headline,
    body: heard.body,
    additionalInfo: heard.additional_heard_information,
    
    // 原始数据
    _raw: heard
  };
}

// ===== 导出为 JSON =====

async function exportHeards(market, options = {}) {
  const results = await cmdHeards(market, { ...options, silent: true });
  
  const parsed = results.map(parseHeardFields);
  
  const filename = `${market.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
  const filepath = join(OUTPUT_DIR, filename);
  
  // 确保目录存在
  const { mkdirSync } = await import('fs');
  mkdirSync(OUTPUT_DIR, { recursive: true });
  
  writeFileSync(filepath, JSON.stringify(parsed, null, 2));
  console.log(`\n✅ 已导出到: ${filepath}`);
  console.log(`   共 ${parsed.length} 条记录`);
  
  return { filepath, count: parsed.length };
}

// ===== 主函数 =====

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  // 解析选项
  const options = {};
  const positionalArgs = [];
  
  args.slice(1).forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      options[key] = value || true;
    } else {
      positionalArgs.push(arg);
    }
  });
  
  try {
    switch (command) {
      case 'markets':
        await cmdMarkets();
        break;
        
      case 'metadata':
        await cmdMetadata();
        break;
        
      case 'heards':
        if (positionalArgs.length === 0) {
          console.error('用法: node platts-structured-heards.mjs heards <market>');
          console.error('示例: node platts-structured-heards.mjs heards "Asia crude oil"');
          process.exit(1);
        }
        await cmdHeards(positionalArgs[0], options);
        break;
        
      case 'table':
        if (positionalArgs.length === 0) {
          console.error('用法: node platts-structured-heards.mjs table <market>');
          process.exit(1);
        }
        await cmdTable(positionalArgs[0], options);
        break;
        
      case 'export':
        if (positionalArgs.length === 0) {
          console.error('用法: node platts-structured-heards.mjs export <market>');
          process.exit(1);
        }
        await exportHeards(positionalArgs[0], options);
        break;
        
      default:
        console.log(`
Platts Structured Heards API - 结构化交易信息

用法：
  node scripts/platts-structured-heards.mjs markets              # 列出市场
  node scripts/platts-structured-heards.mjs metadata             # 字段定义
  node scripts/platts-structured-heards.mjs heards <market>      # 交易信息
  node scripts/platts-structured-heards.mjs table <market>       # 表格输出
  node scripts/platts-structured-heards.mjs export <market>      # 导出 JSON

选项：
  --type=Trade|Bid|Offer    过滤类型
  --days=7                  最近N天
  --limit=20                限制条数
  --grade=<name>            过滤品种

可用市场 (2026-02):
  "Americas crude oil"  - 美洲原油 (19k+ 记录，最完整)
  "Asia crude oil"      - 亚洲原油 (900+ 记录)
  "EMEA crude oil"      - 欧洲/中东/非洲原油
  "Platts Carbon"       - 碳信用 (15k+ 记录)

关键字段：
  heard_type   - Trade/Bid/Offer/Indicative value
  grade        - 油种 (WTI MEH, Mars, Basrah Medium...)
  price        - 价格差 (+0.95, -1.00...)
  pricing_basis- 基准 (Dated Brent, WTI...)
  volume       - 货量 (仅美洲原油有)
  laycan       - 装期 (March, April...)
`);
    }
  } catch (e) {
    console.error('❌ 错误:', e.message);
    process.exit(1);
  }
}

main();
