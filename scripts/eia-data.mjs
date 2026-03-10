#!/usr/bin/env node
/**
 * EIA Data Query Script
 * 查询美国能源信息署数据
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

// 常用数据系列
const SERIES = {
  // 原油库存
  crudeStocksExSPR: {
    path: '/petroleum/stoc/wstk/data/',
    params: { 'facets[product][]': 'EPC0', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'SAX' },
    name: '美国商业原油库存(除SPR)'
  },
  crudeStocksSPR: {
    path: '/petroleum/stoc/wstk/data/',
    params: { 'facets[product][]': 'EPC0', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'SAS' },
    name: 'SPR原油库存'
  },
  // 原油产量
  crudeProduction: {
    path: '/petroleum/sum/sndw/data/',
    params: { 'facets[product][]': 'EPC0', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'FPF' },
    name: '美国原油产量'
  },
  // 汽油库存
  gasolineStocks: {
    path: '/petroleum/stoc/wstk/data/',
    params: { 'facets[product][]': 'EPM0', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'SAE' },
    name: '美国汽油库存'
  },
  // 馏分油库存 (柴油+取暖油)
  distillateStocks: {
    path: '/petroleum/stoc/wstk/data/',
    params: { 'facets[product][]': 'EPD0', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'SAE' },
    name: '美国馏分油库存'
  },
  // 炼厂开工率
  refineryUtilization: {
    path: '/petroleum/sum/sndw/data/',
    params: { 'facets[product][]': 'EPC0', 'facets[duoarea][]': 'NUS', 'facets[process][]': 'OCG' },
    name: '炼厂开工率'
  }
};

async function fetchEIA(seriesKey, weeks = 4) {
  const series = SERIES[seriesKey];
  if (!series) {
    console.error(`Unknown series: ${seriesKey}`);
    console.log('Available:', Object.keys(SERIES).join(', '));
    return null;
  }

  const params = new URLSearchParams({
    api_key: API_KEY,
    frequency: 'weekly',
    'data[0]': 'value',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: weeks.toString(),
    ...series.params
  });

  const url = `${BASE_URL}${series.path}?${params}`;

  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ name: series.name, data: json.response?.data || [] });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function getWeeklyReport() {
  const results = {};
  
  for (const key of ['crudeStocksExSPR', 'crudeStocksSPR', 'gasolineStocks', 'distillateStocks']) {
    try {
      const r = await fetchEIA(key, 2);
      if (r?.data?.length) {
        const latest = r.data[0];
        const prev = r.data[1];
        const change = latest.value && prev?.value ? (parseFloat(latest.value) - parseFloat(prev.value)) : null;
        results[key] = {
          name: r.name,
          period: latest.period,
          value: parseFloat(latest.value),
          unit: latest.units,
          change: change,
          changePercent: change && prev?.value ? (change / parseFloat(prev.value) * 100).toFixed(2) : null
        };
      }
    } catch (e) {
      console.error(`Error fetching ${key}:`, e.message);
    }
  }
  
  return results;
}

// CLI
const userArg = process.argv.find(a => a.startsWith('--user='));
const TRACK_USER = userArg ? userArg.split('=')[1] : 'system';
const cmd = process.argv[2];

if (cmd === 'weekly') {
  getWeeklyReport().then(r => { console.log(JSON.stringify(r, null, 2)); try { trackUsage(TRACK_USER, 'eia', { action: 'weekly', series: 'weekly-summary' }); } catch {} });
} else if (cmd === 'series') {
  const key = process.argv[3];
  const weeks = parseInt(process.argv[4]) || 4;
  fetchEIA(key, weeks).then(r => { console.log(JSON.stringify(r, null, 2)); try { trackUsage(TRACK_USER, 'eia', { action: 'series', series: key }); } catch {} });
} else {
  console.log(`Usage:
  node eia-data.mjs weekly              # 获取周报摘要
  node eia-data.mjs series <key> [n]    # 获取特定数据系列，最近n周

Series keys: ${Object.keys(SERIES).join(', ')}`);
}
