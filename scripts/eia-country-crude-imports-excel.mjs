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
  { code: 'NUS-NCA', english: 'Canada', chinese: '加拿大' },
  { code: 'NUS-NVE', english: 'Venezuela', chinese: '委内瑞拉' },
];

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addYears(date, years) {
  const copy = new Date(date);
  copy.setUTCFullYear(copy.getUTCFullYear() + years);
  return copy;
}

function daysInMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

async function fetchWeeklyCountryImports(start, end) {
  const url = new URL(`${BASE_URL}/petroleum/move/wimpc/data/`);
  url.searchParams.set('api_key', API_KEY);
  url.searchParams.set('frequency', 'weekly');
  url.searchParams.set('data[0]', 'value');
  url.searchParams.set('facets[product][]', 'EPC0');
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
    dateFormat: json.response?.dateFormat,
    frequency: json.response?.frequency,
  };
}

function buildWeeklyRows(apiRows) {
  const countryByCode = Object.fromEntries(COUNTRIES.map((country) => [country.code, country]));
  const byPeriod = new Map();

  for (const row of apiRows) {
    const period = row.period;
    if (!byPeriod.has(period)) byPeriod.set(period, { period });
    const current = byPeriod.get(period);
    const country = countryByCode[row.duoarea];
    if (!country) continue;
    current[`${country.english}_kbd`] = numberOrNull(row.value);
    current[`${country.english}_series`] = row.series;
    current.units = row.units;
  }

  return [...byPeriod.values()]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((row) => ({
      'Week Ending': row.period,
      'Canada (kb/d)': row.Canada_kbd ?? null,
      'Venezuela (kb/d)': row.Venezuela_kbd ?? null,
      'Total Canada + Venezuela (kb/d)':
        row.Canada_kbd == null && row.Venezuela_kbd == null
          ? null
          : (row.Canada_kbd ?? 0) + (row.Venezuela_kbd ?? 0),
      Units: row.units || 'MBBL/D',
      'Canada Series': row.Canada_series || '',
      'Venezuela Series': row.Venezuela_series || '',
    }));
}

function buildMonthlyRows(weeklyRows) {
  const months = new Map();
  for (const row of weeklyRows) {
    const month = row['Week Ending'].slice(0, 7);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(row);
  }

  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, rows]) => {
      const validCanada = rows.map((row) => row['Canada (kb/d)']).filter((v) => v != null);
      const validVenezuela = rows.map((row) => row['Venezuela (kb/d)']).filter((v) => v != null);
      const avg = (values) =>
        values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      const canadaAvg = avg(validCanada);
      const venezuelaAvg = avg(validVenezuela);
      const days = daysInMonth(month);
      return {
        Month: month,
        'Weekly Observations': rows.length,
        'Canada Avg (kb/d)': canadaAvg,
        'Venezuela Avg (kb/d)': venezuelaAvg,
        'Total Avg (kb/d)':
          canadaAvg == null && venezuelaAvg == null ? null : (canadaAvg ?? 0) + (venezuelaAvg ?? 0),
        'Canada Est. Monthly Volume (kbbl)': canadaAvg == null ? null : canadaAvg * days,
        'Venezuela Est. Monthly Volume (kbbl)':
          venezuelaAvg == null ? null : venezuelaAvg * days,
        'Total Est. Monthly Volume (kbbl)':
          canadaAvg == null && venezuelaAvg == null ? null : ((canadaAvg ?? 0) + (venezuelaAvg ?? 0)) * days,
        'Calendar Days': days,
        Note: 'Monthly figures are derived from reported EIA weekly observations by week-ending month. Null values are left blank, not converted to zero.',
      };
    });
}

function autoWidth(rows) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return headers.map((header) => {
    const max = Math.max(
      header.length,
      ...rows.map((row) => String(row[header] ?? '').length)
    );
    return { wch: Math.min(Math.max(max + 2, 12), 42) };
  });
}

function appendSheet(workbook, name, rows) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = autoWidth(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}

async function main() {
  const now = new Date();
  const end = process.argv.find((arg) => arg.startsWith('--end='))?.split('=')[1] || isoDate(now);
  const start =
    process.argv.find((arg) => arg.startsWith('--start='))?.split('=')[1] ||
    isoDate(addYears(new Date(`${end}T00:00:00Z`), -3));

  const result = await fetchWeeklyCountryImports(start, end);
  if (result.rows.length !== result.total) {
    throw new Error(`Expected ${result.total} rows, received ${result.rows.length}; pagination needed.`);
  }

  const weeklyRows = buildWeeklyRows(result.rows);
  const monthlyRows = buildMonthlyRows(weeklyRows);
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
    value: numberOrNull(row.value),
    units: row.units,
  }));

  const generatedAt = new Date().toISOString();
  const readmeRows = [
    { Field: 'Data source', Value: 'U.S. Energy Information Administration API v2' },
    { Field: 'Endpoint', Value: '/petroleum/move/wimpc/data/' },
    { Field: 'Product', Value: 'EPC0 - Crude Oil' },
    { Field: 'Process', Value: 'IM0 - Imports' },
    { Field: 'Countries', Value: 'Canada (NUS-NCA), Venezuela (NUS-NVE)' },
    { Field: 'Requested period', Value: `${start} to ${end}` },
    {
      Field: 'Actual weekly coverage',
      Value: `${weeklyRows[0]?.['Week Ending'] || ''} to ${weeklyRows.at(-1)?.['Week Ending'] || ''}`,
    },
    { Field: 'Weekly unit', Value: 'MBBL/D = thousand barrels per day' },
    {
      Field: 'Monthly method',
      Value:
        'EIA WIMPC does not expose monthly frequency; monthly sheet is derived by averaging reported weekly values by week-ending month, with an estimated full-month volume. Null values are left blank, not converted to zero.',
    },
    { Field: 'Generated at', Value: generatedAt },
  ];

  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, 'Weekly', weeklyRows);
  appendSheet(workbook, 'Monthly_Derived', monthlyRows);
  appendSheet(workbook, 'EIA_Raw', sourceRows);
  appendSheet(workbook, 'README', readmeRows);

  const outDir = path.join(rootDir, 'reports', 'eia');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `us-crude-imports-canada-venezuela-${start}_to_${end}.xlsx`);
  XLSX.writeFile(workbook, outPath);

  console.log(JSON.stringify({
    outPath,
    start,
    end,
    weeklyRows: weeklyRows.length,
    monthlyRows: monthlyRows.length,
    latestWeek: weeklyRows.at(-1)?.['Week Ending'] || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
