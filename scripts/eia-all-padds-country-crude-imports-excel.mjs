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

const PADDS = [
  { code: 'R10', label: 'PADD 1 - East Coast' },
  { code: 'R20', label: 'PADD 2 - Midwest' },
  { code: 'R30', label: 'PADD 3 - Gulf Coast' },
  { code: 'R40', label: 'PADD 4 - Rocky Mountain' },
  { code: 'R50', label: 'PADD 5 - West Coast' },
];

const COUNTRIES = [
  { code: 'NCA', english: 'Canada', chinese: '加拿大' },
  { code: 'NVE', english: 'Venezuela', chinese: '委内瑞拉' },
];

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function addYears(date, years) {
  const copy = new Date(date);
  copy.setUTCFullYear(copy.getUTCFullYear() + years);
  return copy;
}

function duoareaCodes() {
  const codes = [];
  for (const padd of PADDS) {
    for (const country of COUNTRIES) {
      codes.push(`${padd.code}-${country.code}`);
    }
  }
  return codes;
}

async function fetchAllPaddImports(start, end) {
  const url = new URL(`${BASE_URL}/petroleum/move/impcp/data/`);
  url.searchParams.set('api_key', API_KEY);
  url.searchParams.set('frequency', 'monthly');
  url.searchParams.set('data[0]', 'value');
  url.searchParams.set('facets[product][]', 'EPC0');
  url.searchParams.set('facets[process][]', 'IP0');
  for (const code of duoareaCodes()) {
    url.searchParams.append('facets[duoarea][]', code);
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

function parseDuoarea(duoarea) {
  const [paddCode, countryCode] = duoarea.split('-');
  return {
    padd: PADDS.find((item) => item.code === paddCode),
    country: COUNTRIES.find((item) => item.code === countryCode),
  };
}

function buildLongRows(apiRows) {
  const byKey = new Map();

  for (const row of apiRows) {
    const { padd, country } = parseDuoarea(row.duoarea);
    if (!padd || !country) continue;

    const key = `${row.period}|${padd.code}|${country.code}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        Month: row.period,
        PADD: padd.label,
        'PADD Code': padd.code,
        Country: country.english,
        'Country CN': country.chinese,
      });
    }

    const current = byKey.get(key);
    if (row.units === 'MBBL') {
      current['Volume (kbbl)'] = Number(row.value);
      current['Volume Series'] = row.series;
    } else if (row.units === 'MBBL/D') {
      current['Avg (kb/d)'] = Number(row.value);
      current['Rate Series'] = row.series;
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const periodCompare = a.Month.localeCompare(b.Month);
    if (periodCompare) return periodCompare;
    const paddCompare = a['PADD Code'].localeCompare(b['PADD Code']);
    if (paddCompare) return paddCompare;
    return a.Country.localeCompare(b.Country);
  });
}

function buildWideRows(longRows) {
  const byMonth = new Map();

  for (const row of longRows) {
    if (!byMonth.has(row.Month)) byMonth.set(row.Month, { Month: row.Month });
    const current = byMonth.get(row.Month);
    const paddNo = row['PADD Code'].replace('R', '').replace('0', '');
    const prefix = `PADD${paddNo} ${row.Country}`;
    current[`${prefix} Volume (kbbl)`] = row['Volume (kbbl)'] ?? null;
    current[`${prefix} Avg (kb/d)`] = row['Avg (kb/d)'] ?? null;
  }

  return [...byMonth.values()].sort((a, b) => a.Month.localeCompare(b.Month));
}

function buildPaddTotals(longRows) {
  const byKey = new Map();
  for (const row of longRows) {
    const key = `${row.Month}|${row['PADD Code']}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        Month: row.Month,
        PADD: row.PADD,
        'PADD Code': row['PADD Code'],
        'Canada Volume (kbbl)': null,
        'Canada Avg (kb/d)': null,
        'Venezuela Volume (kbbl)': null,
        'Venezuela Avg (kb/d)': null,
      });
    }
    const current = byKey.get(key);
    current[`${row.Country} Volume (kbbl)`] = row['Volume (kbbl)'] ?? null;
    current[`${row.Country} Avg (kb/d)`] = row['Avg (kb/d)'] ?? null;
  }

  return [...byKey.values()]
    .sort((a, b) => {
      const periodCompare = a.Month.localeCompare(b.Month);
      if (periodCompare) return periodCompare;
      return a['PADD Code'].localeCompare(b['PADD Code']);
    })
    .map((row) => ({
      ...row,
      'Total Volume (kbbl)': (row['Canada Volume (kbbl)'] ?? 0) + (row['Venezuela Volume (kbbl)'] ?? 0),
      'Total Avg (kb/d)': (row['Canada Avg (kb/d)'] ?? 0) + (row['Venezuela Avg (kb/d)'] ?? 0),
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

  const result = await fetchAllPaddImports(start, end);
  if (result.rows.length !== result.total) {
    throw new Error(`Expected ${result.total} rows, received ${result.rows.length}; pagination needed.`);
  }

  const longRows = buildLongRows(result.rows);
  const totalRows = buildPaddTotals(longRows);
  const wideRows = buildWideRows(longRows);
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
    { Field: 'PADDs', Value: PADDS.map((item) => `${item.code}: ${item.label}`).join('; ') },
    { Field: 'Product', Value: 'EPC0 - Crude Oil' },
    { Field: 'Process', Value: 'IP0 - Imports by PADD of Processing' },
    { Field: 'Countries', Value: 'Canada, Venezuela' },
    { Field: 'Requested period', Value: `${start} to ${end}` },
    {
      Field: 'Actual coverage',
      Value: `${wideRows[0]?.Month || ''} to ${wideRows.at(-1)?.Month || ''}`,
    },
    { Field: 'Units', Value: 'MBBL = thousand barrels; MBBL/D = thousand barrels per day' },
    { Field: 'Generated at', Value: new Date().toISOString() },
  ];

  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, 'By_PADD_Country_Long', longRows);
  appendSheet(workbook, 'By_PADD_Totals', totalRows);
  appendSheet(workbook, 'Wide_By_Month', wideRows);
  appendSheet(workbook, 'EIA_Raw', sourceRows);
  appendSheet(workbook, 'README', readmeRows);

  const outDir = path.join(rootDir, 'reports', 'eia');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `all-padds-crude-imports-canada-venezuela-${start}_to_${end}.xlsx`);
  XLSX.writeFile(workbook, outPath);

  console.log(JSON.stringify({
    outPath,
    start,
    end,
    longRows: longRows.length,
    totalRows: totalRows.length,
    wideRows: wideRows.length,
    rawRows: sourceRows.length,
    latestMonth: wideRows.at(-1)?.Month || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
