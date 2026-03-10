#!/usr/bin/env node
/**
 * EIA Weekly Report Generator
 * 生成完整的 EIA 周报，包括与上周对比
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { trackUsage } from './usage-tracker.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const credPath = path.join(__dirname, '../.config/eia/credentials.json');
const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
const API_KEY = creds.apiKey;

const BASE_URL = 'https://api.eia.gov/v2';

// 库存数据配置 (stoc/wstk 表)
const STOCK_CONFIG = {
  crudeStocksExSPR: {
    params: { 'facets[product][]': 'EPC0', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'SAX' },
    name: '商业原油库存(除SPR)',
    divider: 1000
  },
  crudeStocksSPR: {
    params: { 'facets[product][]': 'EPC0', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'SAS' },
    name: 'SPR战略储备',
    divider: 1000
  },
  gasolineStocks: {
    params: { 'facets[product][]': 'EPM0', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'SAE' },
    name: '汽油库存',
    divider: 1000
  },
  distillateStocks: {
    params: { 'facets[product][]': 'EPD0', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'SAE' },
    name: '馏分油库存',
    divider: 1000
  },
  cushingStocks: {
    params: { 'facets[product][]': 'EPC0', 'facets[duoarea][]': 'R20', 'facets[process][]': 'SAX' },
    name: 'Cushing原油库存',
    divider: 1000
  },
  jetFuelStocks: {
    params: { 'facets[product][]': 'EPJK', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'SAE' },
    name: '喷气燃料库存',
    divider: 1000
  },
  propaneStocks: {
    params: { 'facets[product][]': 'EPLLPZ', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'SAE' },
    name: '丙烷库存',
    divider: 1000
  }
};

// 供需数据配置 (sum/sndw 表)
const SUPPLY_CONFIG = {
  crudeProduction: {
    params: { 'facets[product][]': 'EPC0', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'FPF' },
    name: '原油产量'
  },
  refineryInputs: {
    params: { 'facets[product][]': 'EPC0', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'YIY' },
    name: '炼厂加工量'
  },
  refineryUtilization: {
    params: { 'facets[product][]': '(NA)', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'YUP' },
    name: '炼厂开工率',
    isPercent: true
  },
  gasolineDemand: {
    params: { 'facets[product][]': 'EPM0F', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'VPP' },
    name: '汽油需求'
  },
  distillateDemand: {
    params: { 'facets[product][]': 'EPD0', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'VPP' },
    name: '馏分油需求'
  },
  jetFuelDemand: {
    params: { 'facets[product][]': 'EPJK', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'VPP' },
    name: '喷气燃料需求'
  }
};

// 进出口数据配置 (move/wkly 表)
const TRADE_CONFIG = {
  crudeImports: {
    params: { 'facets[product][]': 'EPC0', 'facets[duoarea][]': 'NUS-Z00', 'facets[process][]': 'IM0' },
    name: '原油进口'
  },
  crudeExports: {
    params: { 'facets[product][]': 'EPC0', 'facets[duoarea][]': 'NUS-Z00', 'facets[process][]': 'EEX' },
    name: '原油出口'
  },
  crudeNetImports: {
    params: { 'facets[product][]': 'EPC0', 'facets[duoarea][]': 'NUS-Z00', 'facets[process][]': 'IMN' },
    name: '原油净进口'
  }
};

// 按国家进口 (wimpc 表)
const COUNTRY_CODES = {
  'NUS-NCA': '加拿大',
  'NUS-NSA': '沙特',
  'NUS-NIZ': '伊拉克',
  'NUS-NMX': '墨西哥',
  'NUS-NBR': '巴西',
  'NUS-NNI': '尼日利亚',
  'NUS-NVE': '委内瑞拉',
  'NUS-NCO': '哥伦比亚',
  'NUS-NLY': '利比亚'
};

async function fetchData(path, params, weeks = 2) {
  const urlParams = new URLSearchParams({
    api_key: API_KEY,
    frequency: 'weekly',
    'data[0]': 'value',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: weeks.toString(),
    ...params
  });

  const url = `${BASE_URL}${path}?${urlParams}`;

  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.response?.data || []);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchCountryImports(weeks = 2) {
  const data = await fetchData('/petroleum/move/wimpc/data/', { 'facets[product][]': 'EPC0' }, weeks * 15);
  
  const byPeriod = {};
  data.forEach(item => {
    const period = item.period;
    const country = item.duoarea;
    if (!byPeriod[period]) byPeriod[period] = {};
    if (COUNTRY_CODES[country]) {
      byPeriod[period][country] = parseFloat(item.value) || 0;
    }
  });
  
  const periods = Object.keys(byPeriod).sort().reverse();
  return { periods, data: byPeriod };
}

async function generateReport() {
  const results = {};
  
  // 获取库存数据
  for (const [key, config] of Object.entries(STOCK_CONFIG)) {
    try {
      const data = await fetchData('/petroleum/stoc/wstk/data/', config.params, 3);
      if (data?.length >= 2) {
        const latest = data[0];
        const prev = data[1];
        const prev2 = data[2];
        
        const latestVal = parseFloat(latest.value);
        const prevVal = parseFloat(prev.value);
        const change = latestVal - prevVal;
        const prevChange = prev2 ? (prevVal - parseFloat(prev2.value)) : null;
        
        results[key] = {
          name: config.name,
          period: latest.period,
          prevPeriod: prev.period,
          value: latestVal,
          change,
          prevChange,
          divider: config.divider || 1
        };
      }
    } catch (e) {
      // silent
    }
  }
  
  // 获取供需数据
  for (const [key, config] of Object.entries(SUPPLY_CONFIG)) {
    try {
      const data = await fetchData('/petroleum/sum/sndw/data/', config.params, 3);
      if (data?.length >= 2) {
        const latest = data[0];
        const prev = data[1];
        const latestVal = parseFloat(latest.value);
        const prevVal = parseFloat(prev.value);
        
        results[key] = {
          name: config.name,
          period: latest.period,
          value: latestVal,
          change: latestVal - prevVal,
          isPercent: config.isPercent
        };
      }
    } catch (e) {
      // silent
    }
  }
  
  // 获取进出口数据
  for (const [key, config] of Object.entries(TRADE_CONFIG)) {
    try {
      const data = await fetchData('/petroleum/move/wkly/data/', config.params, 2);
      if (data?.length >= 2) {
        const latest = data[0];
        const prev = data[1];
        const latestVal = parseFloat(latest.value);
        const prevVal = parseFloat(prev.value);
        
        results[key] = {
          name: config.name,
          period: latest.period,
          value: latestVal,
          change: latestVal - prevVal
        };
      }
    } catch (e) {
      // silent
    }
  }
  
  // 获取按国家进口数据
  let countryData = null;
  try {
    countryData = await fetchCountryImports(2);
  } catch (e) {
    // silent
  }
  
  // 生成报告
  const period = results.crudeStocksExSPR?.period || 'N/A';
  const prevPeriod = results.crudeStocksExSPR?.prevPeriod || 'N/A';
  
  let report = `📊 EIA 周报 (截至 ${period})\n`;
  report += `对比上周: ${prevPeriod}\n`;
  report += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  // 库存
  report += `【库存】\n`;
  for (const key of ['crudeStocksExSPR', 'cushingStocks', 'gasolineStocks', 'distillateStocks', 'jetFuelStocks', 'propaneStocks', 'crudeStocksSPR']) {
    const r = results[key];
    if (r) {
      const val = (r.value / (r.divider || 1)).toFixed(2);
      const chg = r.change / (r.divider || 1);
      const chgStr = chg >= 0 ? `+${chg.toFixed(2)}` : chg.toFixed(2);
      report += `• ${r.name}: ${val}百万桶 (${chgStr})\n`;
    }
  }
  
  // 供应
  report += `\n【供应】\n`;
  for (const key of ['crudeProduction', 'refineryInputs', 'refineryUtilization']) {
    const r = results[key];
    if (r) {
      if (r.isPercent) {
        const chgStr = r.change >= 0 ? `+${r.change.toFixed(1)}` : r.change.toFixed(1);
        report += `• ${r.name}: ${r.value.toFixed(1)}% (${chgStr}个百分点)\n`;
      } else {
        const chgStr = r.change >= 0 ? `+${r.change.toFixed(0)}` : r.change.toFixed(0);
        report += `• ${r.name}: ${r.value.toFixed(0)}千桶/日 (${chgStr})\n`;
      }
    }
  }
  
  // 进出口
  report += `\n【进出口】\n`;
  for (const key of ['crudeImports', 'crudeExports', 'crudeNetImports']) {
    const r = results[key];
    if (r) {
      const chgStr = r.change >= 0 ? `+${r.change.toFixed(0)}` : r.change.toFixed(0);
      report += `• ${r.name}: ${r.value.toFixed(0)}千桶/日 (${chgStr})\n`;
    }
  }
  
  // 按国家进口
  if (countryData && countryData.periods.length >= 1) {
    const latestPeriod = countryData.periods[0];
    const prevPeriodC = countryData.periods[1];
    const latest = countryData.data[latestPeriod] || {};
    const prev = prevPeriodC ? countryData.data[prevPeriodC] : {};
    
    report += `\n【主要进口来源】\n`;
    const sorted = Object.entries(COUNTRY_CODES)
      .map(([code, name]) => ({ code, name, value: latest[code] || 0, prev: prev[code] || 0 }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value);
    
    for (const item of sorted) {
      const chg = item.value - item.prev;
      const chgStr = chg >= 0 ? `+${chg.toFixed(0)}` : chg.toFixed(0);
      report += `• ${item.name}: ${item.value.toFixed(0)}千桶/日 (${chgStr})\n`;
    }
  }
  
  // 需求
  report += `\n【需求】\n`;
  for (const key of ['gasolineDemand', 'distillateDemand', 'jetFuelDemand']) {
    const r = results[key];
    if (r) {
      const chgStr = r.change >= 0 ? `+${r.change.toFixed(0)}` : r.change.toFixed(0);
      report += `• ${r.name}: ${r.value.toFixed(0)}千桶/日 (${chgStr})\n`;
    }
  }
  
  // 要点
  report += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  report += `【要点】\n`;
  
  const crude = results.crudeStocksExSPR;
  const gasoline = results.gasolineStocks;
  const distillate = results.distillateStocks;
  
  if (crude) {
    const dir = crude.change > 0 ? '增加' : '减少';
    report += `• 原油库存${dir}${Math.abs(crude.change / 1000).toFixed(2)}百万桶`;
    if (crude.prevChange !== null) {
      const prevDir = crude.prevChange > 0 ? '增' : '减';
      report += ` (上周${prevDir}${Math.abs(crude.prevChange / 1000).toFixed(2)})`;
    }
    report += `\n`;
  }
  if (gasoline) {
    const dir = gasoline.change > 0 ? '累库' : '去库';
    report += `• 汽油${dir}${Math.abs(gasoline.change / 1000).toFixed(2)}百万桶\n`;
  }
  if (distillate) {
    const dir = distillate.change > 0 ? '累库' : '去库';
    report += `• 馏分油${dir}${Math.abs(distillate.change / 1000).toFixed(2)}百万桶\n`;
  }
  
  report += `\n来源: EIA Weekly Petroleum Status Report`;
  
  return { report, results, period };
}

// CLI
const userArg = process.argv.find(a => a.startsWith('--user='));
const TRACK_USER = userArg ? userArg.split('=')[1] : 'system';
if (process.argv[2] === 'run') {
  generateReport().then(({ report }) => {
    console.log(report);
    try { trackUsage(TRACK_USER, 'eia', { action: 'weekly-report' }); } catch {}
  }).catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
} else if (process.argv[2] === 'json') {
  generateReport().then(({ results }) => {
    console.log(JSON.stringify(results, null, 2));
    try { trackUsage(TRACK_USER, 'eia', { action: 'weekly-report' }); } catch {}
  }).catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
} else {
  console.log(`Usage:
  node eia-weekly-report.mjs run    # 生成周报文本
  node eia-weekly-report.mjs json   # 输出JSON数据`);
}
