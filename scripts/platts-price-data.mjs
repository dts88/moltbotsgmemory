#!/usr/bin/env node
/**
 * Platts Price Data Fetcher
 * 获取历史价格数据用于周报生成
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { trackUsage } from './usage-tracker.mjs';

const userArg = process.argv.find(a => a.startsWith('--user='));
const TRACK_USER = userArg ? userArg.split('=')[1] : 'system';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CONFIG_FILE = join(WORKSPACE, '.config/spglobal/credentials.json');
const OUTPUT_FILE = join(WORKSPACE, 'reports/price-data.json');

const API_BASE = 'https://api.platts.com';
const APPKEY = 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN';

// 一、价格走势代码
const PRICE_SYMBOLS = {
  'PCAAT00': 'Dubai Mo01 (NextGen MOC)',
  'PCAJG00': 'Brent Mo01 Spore',
  'AAFFU00': 'WTI Spore Mo01',
  'PGAEY00': 'Gasoline Unl 92 FOB Spore Cargo',
  'AAOVC00': 'Gasoil .001%S (10ppm) FOB Spore Cargo',
  'PJABF00': 'Jet Kero FOB Spore Cargo',
  'PPXDK00': 'FO 380 CST 3.5%S FOB Spore Cargo',
  'AAWFW00': 'US Dollar-Chinese Yuan'
};

// 三、成品油利润代码
const MARGIN_SYMBOLS = {
  'PCAAT00': 'Dubai Mo01 (NextGen MOC)',
  'DBSCM00': 'Dubai Singapore Cracking Netback Margin',
  'AAVUD00': 'Naphtha C+F Japan Cargo Dubai Crack Financial Mo01',
  'NBSSM01': 'Naphtha FOB Spore Cargo Brent Crack at Spore MOC Financial Mo01',
  'AAYED00': 'Gasoline 92 RON FOB Spore Dubai Crack Financial Mo01',
  'AAHCL00': 'Jet Kero FOB Spore Cargo Dubai Crack Financial Mo01',
  'AAHCE00': 'Gasoil FOB Spore Cargo Dubai Crack Financial Mo01',
  'AAHBX00': 'FO 180 CST 3.5%S FOB Spore Cargo Dubai Crack Financial Mo01',
  'AAWHA00': 'FO 380 CST 3.5% FOB Spore Cargo Dubai Crack Financial Mo01',
  'MFFOB01': 'Marine Fuel 0.5% FOB Fujairah Cargo Dubai Crack Financial Mo01',
  'AAVAN00': 'Butane Refrigerated CFR North Asia 30-45 days',
  'AAVAK00': 'Propane Refrigerated CFR North Asia 30-45 days'
};

// AAWFW00 用 bate='u'，其他用 bate='c'
const SPECIAL_BATE = { 'AAWFW00': 'u' };

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
}

async function fetchHistorical(token, symbols, startDate, endDate) {
  const symbolFilter = 'symbol in ("' + symbols.join('","') + '")';
  const dateFilter = `assessDate>="${startDate}" AND assessDate<="${endDate}"`;
  const filter = `${symbolFilter} AND ${dateFilter}`;
  
  const params = new URLSearchParams({
    filter,
    pageSize: '5000'
  });
  
  const url = `${API_BASE}/market-data/v3/value/history/symbol?${params}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'appkey': APPKEY
    }
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Historical API Error ${response.status}: ${text}`);
  }
  
  return response.json();
}

// 获取指定日期（周几）
function getDateForWeekday(targetDay, weeksBack = 0, referenceDate = new Date()) {
  const d = new Date(referenceDate);
  d.setHours(12, 0, 0, 0);
  const current = d.getDay();
  
  // weekday: 0=Sun, 1=Mon, ..., 4=Thu, 5=Fri, 6=Sat
  let daysBack = current - targetDay;
  if (daysBack < 0) daysBack += 7;
  
  d.setDate(d.getDate() - daysBack - (weeksBack * 7));
  return d.toISOString().split('T')[0];
}

async function main() {
  const config = loadConfig();
  const token = config.access_token;
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const dayOfWeek = today.getDay(); // 0=Sun, 4=Thu, 5=Fri
  
  // 计算需要的日期
  // 一、价格走势: 本周五 vs 昨日 vs 上周五
  const thisFriday = getDateForWeekday(5, 0);
  const lastFriday = getDateForWeekday(5, 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  // 三、成品油: 上周四 vs 本周四
  const thisThursday = getDateForWeekday(4, 0);
  const lastThursday = getDateForWeekday(4, 1);
  
  console.log('[Platts] 日期计算:');
  console.log(`  今天: ${todayStr} (周${['日','一','二','三','四','五','六'][dayOfWeek]})`);
  console.log(`  昨日: ${yesterdayStr}`);
  console.log(`  本周五: ${thisFriday}`);
  console.log(`  上周五: ${lastFriday}`);
  console.log(`  本周四: ${thisThursday}`);
  console.log(`  上周四: ${lastThursday}`);
  
  // 获取所有代码
  const priceSymbolList = Object.keys(PRICE_SYMBOLS);
  const marginSymbolList = Object.keys(MARGIN_SYMBOLS);
  const allSymbols = [...new Set([...priceSymbolList, ...marginSymbolList])];
  
  // 日期范围：从上周四到今天
  const startDate = lastThursday < lastFriday ? lastThursday : lastFriday;
  
  console.log(`\n[Platts] 获取历史数据 ${startDate} ~ ${todayStr}...`);
  
  const histData = await fetchHistorical(token, allSymbols, startDate, todayStr);
  console.log(`[Platts] 返回 ${histData.results?.length || 0} 个代码的数据`);
  
  // 整理数据: symbol -> date -> value
  const priceMap = {};
  histData.results?.forEach(r => {
    priceMap[r.symbol] = {};
    const targetBate = SPECIAL_BATE[r.symbol] || 'c';
    r.data?.forEach(d => {
      if (d.bate === targetBate) {
        const date = d.assessDate?.split('T')[0];
        priceMap[r.symbol][date] = d.value;
      }
    });
  });
  
  // 输出结构
  const output = {
    fetchedAt: new Date().toISOString(),
    dates: {
      today: todayStr,
      yesterday: yesterdayStr,
      thisFriday,
      lastFriday,
      thisThursday,
      lastThursday
    },
    priceSection: { symbols: PRICE_SYMBOLS, data: {} },
    marginSection: { symbols: MARGIN_SYMBOLS, data: {} }
  };
  
  // 填充价格走势数据
  console.log('\n=== 一、价格走势 (本周五 vs 昨日 vs 上周五) ===');
  console.log('代码\t\t本周五\t\t昨日\t\t上周五\t\t周变化');
  for (const [symbol, name] of Object.entries(PRICE_SYMBOLS)) {
    const data = priceMap[symbol] || {};
    const fri = data[thisFriday];
    const yest = data[yesterdayStr];
    const lastFri = data[lastFriday];
    const weekChange = (fri !== undefined && lastFri !== undefined) ? (fri - lastFri) : null;
    
    output.priceSection.data[symbol] = {
      name,
      thisFriday: fri,
      yesterday: yest,
      lastFriday: lastFri,
      weekChange
    };
    
    const fmt = (v) => v !== undefined ? v.toFixed(2) : '-';
    const chg = weekChange !== null ? (weekChange >= 0 ? '+' : '') + weekChange.toFixed(2) : '-';
    console.log(`${symbol}\t${fmt(fri)}\t\t${fmt(yest)}\t\t${fmt(lastFri)}\t\t${chg}`);
  }
  
  // 填充成品油利润数据
  console.log('\n=== 三、成品油利润 (本周四 vs 上周四) ===');
  console.log('代码\t\t本周四\t\t上周四\t\t变化');
  for (const [symbol, name] of Object.entries(MARGIN_SYMBOLS)) {
    if (symbol === 'PCAAT00') continue;
    const data = priceMap[symbol] || {};
    const thu = data[thisThursday];
    const lastThu = data[lastThursday];
    const change = (thu !== undefined && lastThu !== undefined) ? (thu - lastThu) : null;
    
    output.marginSection.data[symbol] = {
      name,
      thisThursday: thu,
      lastThursday: lastThu,
      change
    };
    
    const fmt = (v) => v !== undefined ? v.toFixed(3) : '-';
    const chg = change !== null ? (change >= 0 ? '+' : '') + change.toFixed(3) : '-';
    console.log(`${symbol}\t${fmt(thu)}\t\t${fmt(lastThu)}\t\t${chg}`);
  }
  
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n[Platts] 已保存到 ${OUTPUT_FILE}`);
  try { trackUsage(TRACK_USER, 'platts', { action: 'price-data' }); } catch {}
  
  return output;
}

main().catch(err => {
  console.error('[Platts] 错误:', err.message);
  process.exit(1);
});
