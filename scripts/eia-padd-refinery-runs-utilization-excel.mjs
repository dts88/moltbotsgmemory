#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const credPath = path.join(rootDir, '.config/eia/credentials.json');
const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));

const API_KEY = creds.apiKey;
const BASE_URL = 'https://api.eia.gov/v2/petroleum/pnp/wiup/data/';
const OUT_DIR = path.join(rootDir, 'reports', 'eia');

const AREAS = [
  { code: 'NUS', name: 'U.S.' },
  { code: 'R10', name: 'PADD 1 - East Coast' },
  { code: 'R20', name: 'PADD 2 - Midwest' },
  { code: 'R30', name: 'PADD 3 - Gulf Coast' },
  { code: 'R40', name: 'PADD 4 - Rocky Mountain' },
  { code: 'R50', name: 'PADD 5 - West Coast' },
];

const SERIES = [
  {
    key: 'crudeNetInput',
    label: 'Crude Oil Refinery Net Input',
    product: 'EPC0',
    process: 'YIY',
    units: 'kb/d',
  },
  {
    key: 'grossInputs',
    label: 'Gross Inputs into Refineries',
    product: 'EPXXX2',
    process: 'YIY',
    units: 'kb/d',
  },
  {
    key: 'operableCapacity',
    label: 'Operable Crude Oil Distillation Capacity',
    product: null,
    responseProduct: '(NA)',
    process: 'YRL',
    units: 'kb/d',
  },
  {
    key: 'utilization',
    label: 'Percent Utilization of Refinery Operable Capacity',
    product: null,
    responseProduct: '(NA)',
    process: 'YUP',
    units: '%',
  },
];

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addYears(date, years) {
  const copy = new Date(date);
  copy.setUTCFullYear(copy.getUTCFullYear() + years);
  return copy;
}

function monthKey(period) {
  return period.slice(0, 7);
}

async function fetchSeries({ start, end, series }) {
  const url = new URL(BASE_URL);
  url.searchParams.set('api_key', API_KEY);
  url.searchParams.set('frequency', 'weekly');
  url.searchParams.set('data[0]', 'value');
  if (series.product) {
    url.searchParams.set('facets[product][]', series.product);
  }
  url.searchParams.set('facets[process][]', series.process);
  for (const area of AREAS) {
    url.searchParams.append('facets[duoarea][]', area.code);
  }
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  url.searchParams.set('sort[0][column]', 'period');
  url.searchParams.set('sort[0][direction]', 'asc');
  url.searchParams.set('length', '5000');

  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`EIA API ${response.status}: ${body.slice(0, 500)}`);
  }
  const json = JSON.parse(body);
  const rows = (json.response?.data || []).filter(
    (row) => !series.responseProduct || row.product === series.responseProduct,
  );
  const total = Number(json.response?.total || rows.length);
  if (rows.length < total) {
    throw new Error(`Incomplete EIA response for ${series.key}: got ${rows.length} of ${total}`);
  }
  return { rows, url: url.toString().replace(API_KEY, 'API_KEY') };
}

function upsert(map, period, areaCode, areaName) {
  const key = `${period}|${areaCode}`;
  if (!map.has(key)) {
    map.set(key, {
      Period: period,
      areaCode,
      areaName,
    });
  }
  return map.get(key);
}

function buildWeeklyRows(fetched) {
  const map = new Map();
  for (const item of fetched) {
    for (const row of item.rows) {
      const current = upsert(map, row.period, row.duoarea, areaLabel(row.duoarea, row['area-name']));
      const value = numberOrNull(row.value);
      current[`${item.series.label} (${item.series.units})`] = value;
      current[`${item.series.key}Series`] = row.series;
    }
  }

  for (const row of map.values()) {
    const utilKey = 'Percent Utilization of Refinery Operable Capacity (%)';
    if (row[utilKey] == null && row['Gross Inputs into Refineries (kb/d)'] != null && row['Operable Crude Oil Distillation Capacity (kb/d)'] != null) {
      row[utilKey] = round(
        (row['Gross Inputs into Refineries (kb/d)'] / row['Operable Crude Oil Distillation Capacity (kb/d)']) * 100,
        1,
      );
      row.utilizationSeries = 'derived:grossInputs/operableCapacity';
    }
  }

  return [...map.values()].sort((a, b) => a.Period.localeCompare(b.Period) || areaSort(a.areaCode) - areaSort(b.areaCode));
}

function areaLabel(code, fallback) {
  return AREAS.find((area) => area.code === code)?.name || fallback || code;
}

function areaSort(code) {
  return AREAS.findIndex((area) => area.code === code);
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function average(values) {
  const valid = values.filter((value) => value != null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function round(value, digits = 3) {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function aggregateRows(weeklyRows, periodKey, labelName) {
  const buckets = new Map();
  for (const row of weeklyRows) {
    const period = periodKey(row.Period);
    const key = `${period}|${row.areaCode}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        [labelName]: period,
        areaCode: row.areaCode,
        areaName: row.areaName,
        rows: [],
      });
    }
    buckets.get(key).rows.push(row);
  }

  return [...buckets.values()]
    .sort((a, b) => String(a[labelName]).localeCompare(String(b[labelName])) || areaSort(a.areaCode) - areaSort(b.areaCode))
    .map((bucket) => {
      const rows = bucket.rows;
      return {
        [labelName]: bucket[labelName],
        areaCode: bucket.areaCode,
        areaName: bucket.areaName,
        'Weekly Observations': rows.length,
        'Crude Oil Refinery Net Input Avg (kb/d)': round(average(rows.map((row) => row['Crude Oil Refinery Net Input (kb/d)']))),
        'Gross Inputs Avg (kb/d)': round(average(rows.map((row) => row['Gross Inputs into Refineries (kb/d)']))),
        'Operable Capacity Avg (kb/d)': round(average(rows.map((row) => row['Operable Crude Oil Distillation Capacity (kb/d)']))),
        'Utilization Avg (%)': round(average(rows.map((row) => row['Percent Utilization of Refinery Operable Capacity (%)']))),
        'Crude Input Min (kb/d)': round(Math.min(...rows.map((row) => row['Crude Oil Refinery Net Input (kb/d)']).filter((value) => value != null))),
        'Crude Input Max (kb/d)': round(Math.max(...rows.map((row) => row['Crude Oil Refinery Net Input (kb/d)']).filter((value) => value != null))),
      };
    });
}

function latestRows(weeklyRows) {
  const latestPeriod = weeklyRows.reduce((latest, row) => (row.Period > latest ? row.Period : latest), '');
  return weeklyRows.filter((row) => row.Period === latestPeriod);
}

function readmeRows({ start, end, fetched }) {
  return [
    { Field: 'Endpoint', Value: '/v2/petroleum/pnp/wiup/data/' },
    { Field: 'Route name', Value: 'Weekly Inputs & Utilization' },
    { Field: 'Period requested', Value: `${start} to ${end}` },
    { Field: 'Frequency', Value: 'weekly' },
    { Field: 'Areas', Value: AREAS.map((area) => `${area.code}=${area.name}`).join('; ') },
    { Field: 'Crude runs / processing volume', Value: 'product=EPC0, process=YIY: Refiner Net Input of Crude Oil, kb/d' },
    { Field: 'Gross inputs', Value: 'product=EPXXX2, process=YIY: Gross Inputs into Refineries, kb/d' },
    { Field: 'Operable capacity', Value: 'product=(NA), process=YRL: Operable Crude Oil Distillation Capacity, kb/d' },
    { Field: 'Utilization', Value: 'product=(NA), process=YUP: Percent Utilization of Refinery Operable Capacity' },
    { Field: 'EIA route note', Value: 'Percent Utilization is calculated as gross inputs divided by the latest reported monthly operable capacity, using unrounded numbers.' },
    { Field: 'API URLs', Value: fetched.map((item) => item.url).join('\n') },
  ];
}

async function main() {
  const now = new Date();
  const end = process.argv.find((arg) => arg.startsWith('--end='))?.split('=')[1] || isoDate(now);
  const start =
    process.argv.find((arg) => arg.startsWith('--start='))?.split('=')[1] ||
    isoDate(addYears(new Date(`${end}T00:00:00Z`), -3));

  const fetched = [];
  for (const series of SERIES) {
    fetched.push({
      series,
      ...(await fetchSeries({ start, end, series })),
    });
  }

  const weeklyRows = buildWeeklyRows(fetched);
  const monthlyRows = aggregateRows(weeklyRows, monthKey, 'Month');
  const annualRows = aggregateRows(weeklyRows, (period) => period.slice(0, 4), 'Year');
  const latest = latestRows(weeklyRows);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(readmeRows({ start, end, fetched })), 'README');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(latest), 'Latest Week');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weeklyRows), 'Weekly PADD');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows), 'Monthly Avg PADD');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(annualRows), 'Annual Avg PADD');

  const outPath = path.join(OUT_DIR, `eia-padd-refinery-runs-utilization-${start}_to_${end}.xlsx`);
  XLSX.writeFile(wb, outPath);

  console.log(JSON.stringify({
    outPath,
    start,
    end,
    weeklyRows: weeklyRows.length,
    monthlyRows: monthlyRows.length,
    annualRows: annualRows.length,
    latestPeriod: latest[0]?.Period,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
