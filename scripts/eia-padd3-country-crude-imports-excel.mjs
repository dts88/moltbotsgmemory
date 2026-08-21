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
const BASE_URL = 'https://api.eia.gov/v2';

const COUNTRIES = [
  { code: 'R30-NCA', english: 'Canada', chinese: '加拿大' },
  { code: 'R30-NVE', english: 'Venezuela', chinese: '委内瑞拉' },
];

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function addYears(date, years) {
  const copy = new Date(date);
  copy.setUTCFullYear(copy.getUTCFullYear() + years);
  return copy;
}

async function fetchPadd3Imports(start, end) {
  const url = new URL(`${BASE_URL}/petroleum/move/impcp/data/`);
  url.searchParams.set('api_key', API_KEY);
  url.searchParams.set('frequency', 'monthly');
  url.searchParams.set('data[0]', 'value');
  url.searchParams.set('facets[product][]', 'EPC0');
  url.searchParams.set('facets[process][]', 'IP0');
  for (const country of COUNTRIES) {
    url.searchParams.append('facets[duoarea][]', country.code);
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
  const data = json.response?.data || [];
  return {
    rows: data,
    total: Number(json.response?.total || data.length),
    startPeriod: json.response?.startPeriod,
    endPeriod: json.response?.endPeriod,
    frequency: json.response?.frequency,
  };
}

function buildMonthlyRows(apiRows) {
  const countryByCode = Object.fromEntries(COUNTRIES.map((country) => [country.code, country]));
  const byMonth = new Map();

  for (const row of apiRows) {
    const month = row.period;
    if (!byMonth.has(month)) byMonth.set(month, { Month: month });
    const current = byMonth.get(month);
    const country = countryByCode[row.duoarea];
    if (!country) continue;

    const value = Number(row.value);
    const prefix = country.english;
    if (row.units === 'MBBL') {
      current[`${prefix}_mbbl`] = value;
      current[`${prefix}_volume_series`] = row.series;
    } else if (row.units === 'MBBL/D') {
      current[`${prefix}_kbd`] = value;
      current[`${prefix}_rate_series`] = row.series;
    }
  }

  return [...byMonth.values()]
    .sort((a, b) => a.Month.localeCompare(b.Month))
    .map((row) => ({
      Month: row.Month,
      'PADD': 'PADD 3 - Gulf Coast',
      'Canada Volume (kbbl)': row.Canada_mbbl ?? null,
      'Canada Avg (kb/d)': row.Canada_kbd ?? null,
      'Venezuela Volume (kbbl)': row.Venezuela_mbbl ?? null,
      'Venezuela Avg (kb/d)': row.Venezuela_kbd ?? null,
      'Total Volume (kbbl)': (row.Canada_mbbl ?? 0) + (row.Venezuela_mbbl ?? 0),
      'Total Avg (kb/d)': (row.Canada_kbd ?? 0) + (row.Venezuela_kbd ?? 0),
      'Canada Volume Series': row.Canada_volume_series || '',
      'Canada Rate Series': row.Canada_rate_series || '',
      'Venezuela Volume Series': row.Venezuela_volume_series || '',
      'Venezuela Rate Series': row.Venezuela_rate_series || '',
    }));
}

function autoWidth(rows) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return headers.map((header) => {
    const max = Math.max(header.length, ...rows.map((row) => String(row[header] ?? '').length));
    return { wch: Math.min(Math.max(max + 2, 12), 46) };
  });
}

function appendSheet(workbook, name, rows) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = autoWidth(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}

async function main() {
  const now = new Date();
  const end = process.argv.find((arg) => arg.startsWith('--end='))?.split('=')[1] || monthKey(now);
  const start =
    process.argv.find((arg) => arg.startsWith('--start='))?.split('=')[1] ||
    monthKey(addYears(new Date(`${end}-01T00:00:00Z`), -3));

  const result = await fetchPadd3Imports(start, end);
  if (result.rows.length !== result.total) {
    throw new Error(`Expected ${result.total} rows, received ${result.rows.length}; pagination needed.`);
  }

  const monthlyRows = buildMonthlyRows(result.rows);
  const sourceRows = result.rows.map((row) => ({
    period: row.period,
    duoarea: row.duoarea,
    'area-name': row['area-name'],
    product: row.product,
    'product-name': row['product-name'],
    process: row.process,
    'process-name': row['process-name'],
    series: row.series,
    'series-description': row['series-description'],
    value: Number(row.value),
    units: row.units,
  }));

  const readmeRows = [
    { Field: 'Data source', Value: 'U.S. Energy Information Administration API v2' },
    { Field: 'Endpoint', Value: '/petroleum/move/impcp/data/' },
    { Field: 'Route', Value: 'PAD District Imports by Country of Origin' },
    { Field: 'Frequency', Value: 'Monthly. This EIA route does not provide weekly data.' },
    { Field: 'PADD', Value: 'PADD 3 - Gulf Coast (R30)' },
    { Field: 'Product', Value: 'EPC0 - Crude Oil' },
    { Field: 'Process', Value: 'IP0 - Imports by PADD of Processing' },
    { Field: 'Countries', Value: 'Canada (R30-NCA), Venezuela (R30-NVE)' },
    { Field: 'Requested period', Value: `${start} to ${end}` },
    {
      Field: 'Actual coverage',
      Value: `${monthlyRows[0]?.Month || ''} to ${monthlyRows.at(-1)?.Month || ''}`,
    },
    { Field: 'Units', Value: 'MBBL = thousand barrels; MBBL/D = thousand barrels per day' },
    {
      Field: 'Generated at',
      Value: new Date().toISOString(),
    },
  ];

  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, 'PADD3_Monthly', monthlyRows);
  appendSheet(workbook, 'EIA_Raw', sourceRows);
  appendSheet(workbook, 'README', readmeRows);

  const outDir = path.join(rootDir, 'reports', 'eia');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `padd3-crude-imports-canada-venezuela-${start}_to_${end}.xlsx`);
  XLSX.writeFile(workbook, outPath);

  console.log(JSON.stringify({
    outPath,
    start,
    end,
    monthlyRows: monthlyRows.length,
    rawRows: sourceRows.length,
    latestMonth: monthlyRows.at(-1)?.Month || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
