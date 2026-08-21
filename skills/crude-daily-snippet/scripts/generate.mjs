#!/usr/bin/env node

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getPlattsAccessToken } from '../../../scripts/platts-auth.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPKEY = 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN';
const API_BASE = 'https://api.platts.com';

const SYMBOLS = {
  PCAAT00: 'Dubai Mo1',
  PCAAV00: 'Dubai Mo3',
  PCAAS00: 'Dated Brent',
  AAYES00: 'ICE Brent London 16:30',
  ICLL001: 'ICE Brent settlement',
  ICIC001: 'ICE WTI settlement'
};

const ANCHORS = ['PCAAS00', 'AAYES00', 'ICLL001', 'ICIC001'];

function isoDateInTz(date, timeZone = 'Asia/Singapore') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function defaultTargetDate() {
  return addDays(isoDateInTz(new Date(), 'Asia/Singapore'), -1);
}

function fmtNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 10000) / 10000;
  return rounded.toFixed(4).replace(/\.?0+$/, '') || '0';
}

function fmtChg(cur, prev) {
  if (!Number.isFinite(prev)) return '-';
  const diff = Math.round((cur - prev) * 10000) / 10000;
  if (Math.abs(diff) < 1e-9) return '持平';
  return `${diff > 0 ? '涨' : '跌'}${fmtNum(Math.abs(diff))}`;
}

function line(series, symbol, date) {
  const current = series[symbol]?.[date];
  if (!Number.isFinite(current)) return null;
  const previousDates = Object.keys(series[symbol])
    .filter(d => d < date)
    .sort();
  const previous = previousDates.length ? series[symbol][previousDates.at(-1)] : null;
  return `${fmtNum(current)}（${fmtChg(current, previous)}）`;
}

function monthDay(isoDate) {
  const [, , month, day] = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  if (!month || !day) throw new Error(`Invalid date: ${isoDate}`);
  return `${Number(month)}月${Number(day)}日`;
}

async function fetchHistory(token, symbols, startDate, endDate) {
  const filter = `symbol in ("${symbols.join('","')}") AND assessDate>="${startDate}" AND assessDate<="${endDate}"`;
  const url = `${API_BASE}/market-data/v3/value/history/symbol?${new URLSearchParams({
    filter,
    pageSize: '5000'
  })}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      appkey: APPKEY
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Platts history API HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json();
}

function normalizeSeries(payload) {
  const series = Object.fromEntries(Object.keys(SYMBOLS).map(symbol => [symbol, {}]));

  for (const result of payload?.results || []) {
    const symbol = result?.symbol;
    if (!series[symbol]) continue;

    for (const item of result?.data || []) {
      if (String(item?.bate || '').toLowerCase() !== 'c') continue;
      const date = String(item?.assessDate || '').slice(0, 10);
      const value = Number(item?.value);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value)) {
        series[symbol][date] = value;
      }
    }
  }

  return series;
}

function latestCompleteDate(series) {
  let common = null;
  for (const symbol of ANCHORS) {
    const dates = new Set(Object.keys(series[symbol] || {}));
    common = common ? new Set([...common].filter(date => dates.has(date))) : dates;
  }
  if (!common?.size) return null;
  return [...common].sort().at(-1);
}

function requireDate(series, date) {
  const missingAnchors = ANCHORS.filter(symbol => !Number.isFinite(series[symbol]?.[date]));
  if (missingAnchors.length) {
    throw new Error(`${date} incomplete: missing ${missingAnchors.join(', ')}`);
  }
}

function buildSnippet(series, targetDate) {
  const spread = {};
  for (const date of Object.keys(series.PCAAT00 || {})) {
    if (Number.isFinite(series.PCAAV00?.[date])) {
      spread[date] = series.PCAAT00[date] - series.PCAAV00[date];
    }
  }
  series.DUBAI_M1_M3 = spread;

  const required = {
    PCAAT00: line(series, 'PCAAT00', targetDate),
    DUBAI_M1_M3: line(series, 'DUBAI_M1_M3', targetDate),
    PCAAS00: line(series, 'PCAAS00', targetDate),
    AAYES00: line(series, 'AAYES00', targetDate),
    ICLL001: line(series, 'ICLL001', targetDate),
    ICIC001: line(series, 'ICIC001', targetDate)
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([symbol]) => symbol);
  if (missing.length) {
    throw new Error(`${targetDate} missing values: ${missing.join(', ')}`);
  }

  return [
    `${monthDay(targetDate)} `,
    '新加坡16:30',
    `迪拜 ${required.PCAAT00}`,
    `迪拜M1-M3 ${required.DUBAI_M1_M3}`,
    '',
    '伦敦16:30',
    `Dated现货布伦特 ${required.PCAAS00}`,
    `ICE布伦特 ${required.AAYES00}`,
    '',
    '期货收盘结算价',
    `ICE布伦特 ${required.ICLL001}`,
    `WTI  ${required.ICIC001}`
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  const targetDate = args[0] || defaultTargetDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error('Usage: node generate.mjs [YYYY-MM-DD]');
  }

  const token = await getPlattsAccessToken({ quiet: true });
  const startDate = addDays(targetDate, -14);
  const endDate = addDays(targetDate, 1);
  const payload = await fetchHistory(token, Object.keys(SYMBOLS), startDate, endDate);
  const series = normalizeSeries(payload);

  if (args[0]) {
    requireDate(series, targetDate);
  } else {
    const latest = latestCompleteDate(series);
    if (!latest) throw new Error('No complete trading day found');
    if (latest !== targetDate) {
      throw new Error(`上一日 ${targetDate} 数据未齐；最新完整交易日为 ${latest}`);
    }
  }

  process.stdout.write(`${buildSnippet(series, targetDate)}\n`);
}

main().catch(error => {
  process.stderr.write(`[crude-daily-snippet] ${error.message}\n`);
  process.exit(1);
});
