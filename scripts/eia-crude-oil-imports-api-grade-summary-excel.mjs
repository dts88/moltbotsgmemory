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
const BASE_URL = 'https://api.eia.gov/v2/crude-oil-imports/data/';
const OUT_DIR = path.join(rootDir, 'reports', 'eia');

const ORIGINS = [
  { id: 'CTY_CA', name: 'Canada' },
  { id: 'CTY_VE', name: 'Venezuela' },
];

const DESTINATION_TYPES = [
  { id: 'US', sheet: 'US Total', description: 'United States total' },
  { id: 'RP', sheet: 'Refinery PADD', description: 'PADD of refinery/processing destination' },
  { id: 'PP', sheet: 'Port PADD', description: 'PADD of import entry port' },
];

const GRADES = [
  { gradeId: 'HSO', gradeName: 'Heavy Sour' },
  { gradeId: 'HSW', gradeName: 'Heavy Sweet' },
  { gradeId: 'MED', gradeName: 'Medium' },
  { gradeId: 'LSO', gradeName: 'Light Sour' },
  { gradeId: 'LSW', gradeName: 'Light Sweet' },
];

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function addYears(date, years) {
  const copy = new Date(date);
  copy.setUTCFullYear(copy.getUTCFullYear() + years);
  return copy;
}

function daysInMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

async function fetchRows({ start, end, destinationType }) {
  const rows = [];
  let total = null;
  let description = '';
  let endPeriod = '';
  let firstUrl = '';
  const pageSize = 5000;

  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(BASE_URL);
    url.searchParams.set('api_key', API_KEY);
    url.searchParams.set('frequency', 'monthly');
    url.searchParams.set('data[0]', 'quantity');
    for (const origin of ORIGINS) {
      url.searchParams.append('facets[originId][]', origin.id);
    }
    url.searchParams.append('facets[destinationType][]', destinationType);
    url.searchParams.set('start', start);
    url.searchParams.set('end', end);
    url.searchParams.set('sort[0][column]', 'period');
    url.searchParams.set('sort[0][direction]', 'asc');
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('length', String(pageSize));

    const response = await fetch(url);
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`EIA API ${response.status}: ${body.slice(0, 500)}`);
    }
    const json = JSON.parse(body);
    const pageRows = json.response?.data || [];
    total = Number(json.response?.total || rows.length + pageRows.length);
    description ||= json.response?.description || '';
    endPeriod ||= json.response?.endPeriod || '';
    firstUrl ||= url.toString().replace(API_KEY, 'API_KEY');
    rows.push(...pageRows);

    if (!pageRows.length || rows.length >= total || pageRows.length < pageSize) break;
  }

  return {
    rows,
    total: total ?? rows.length,
    description,
    endPeriod,
    url: firstUrl,
  };
}

function normalizeRows(apiRows) {
  return apiRows
    .map((row) => {
      const quantity = Number(row.quantity);
      const month = row.period;
      return {
        Month: month,
        originId: row.originId,
        originName: row.originName,
        originType: row.originType,
        destinationId: row.destinationId,
        destinationName: row.destinationName,
        destinationType: row.destinationType,
        destinationTypeName: row.destinationTypeName,
        gradeId: row.gradeId,
        gradeName: row.gradeName,
        'Quantity (kbbl)': Number.isFinite(quantity) ? quantity : null,
        'Avg (kb/d)': Number.isFinite(quantity) ? Math.round((quantity / daysInMonth(month)) * 1000) / 1000 : null,
        Units: row['quantity-units'] || 'thousand barrels',
      };
    })
    .sort((a, b) =>
      a.Month.localeCompare(b.Month) ||
      a.originName.localeCompare(b.originName) ||
      a.destinationId.localeCompare(b.destinationId) ||
      a.gradeId.localeCompare(b.gradeId),
    );
}

function wideByGrade(rows, dimensions) {
  const map = new Map();
  for (const row of rows) {
    const key = dimensions.map((dim) => row[dim] ?? '').join('|');
    if (!map.has(key)) {
      map.set(key, Object.fromEntries(dimensions.map((dim) => [dim, row[dim] ?? ''])));
    }
    const current = map.get(key);
    current[`${row.gradeId} ${row.gradeName} (kbbl)`] = row['Quantity (kbbl)'];
    current[`${row.gradeId} ${row.gradeName} (kb/d)`] = row['Avg (kb/d)'];
  }

  return [...map.values()]
    .map((row) => {
      for (const grade of GRADES) {
        row[`${grade.gradeId} ${grade.gradeName} (kbbl)`] ??= 0;
        row[`${grade.gradeId} ${grade.gradeName} (kb/d)`] ??= 0;
      }
      return row;
    })
    .sort((a, b) => dimensions.map((dim) => String(a[dim]).localeCompare(String(b[dim]))).find(Boolean) || 0);
}

function countryTotals(usRows) {
  const map = new Map();
  for (const row of usRows) {
    const key = `${row.originName}|${row.gradeId}|${row.gradeName}`;
    if (!map.has(key)) {
      map.set(key, {
        originName: row.originName,
        gradeId: row.gradeId,
        gradeName: row.gradeName,
        'Quantity (kbbl)': 0,
      });
    }
    map.get(key)['Quantity (kbbl)'] += row['Quantity (kbbl)'] || 0;
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      'Quantity (kbbl)': Math.round(row['Quantity (kbbl)'] * 1000) / 1000,
    }))
    .sort((a, b) => a.originName.localeCompare(b.originName) || a.gradeId.localeCompare(b.gradeId));
}

function readmeRows({ start, end, fetched }) {
  return [
    { Field: 'Endpoint', Value: '/v2/crude-oil-imports/data/' },
    { Field: 'Source description', Value: fetched[0]?.description || 'EIA-814 crude oil imports by country to destination, including grade and quantity' },
    { Field: 'Frequency', Value: 'monthly' },
    { Field: 'Period requested', Value: `${start} to ${end}` },
    { Field: 'Countries/originId', Value: ORIGINS.map((origin) => `${origin.id}=${origin.name}`).join('; ') },
    { Field: 'Data field', Value: 'quantity (thousand barrels)' },
    { Field: 'Grade IDs', Value: GRADES.map((grade) => `${grade.gradeId}=${grade.gradeName}`).join('; ') },
    { Field: 'Destination sheets', Value: DESTINATION_TYPES.map((item) => `${item.id}=${item.description}`).join('; ') },
    { Field: 'Important caveat', Value: 'US, RP, and PP are separate destination lenses. Do not sum RP and PP together, or the same barrels may be double-counted.' },
    { Field: 'API URLs', Value: fetched.map((item) => item.url).join('\n') },
  ];
}

async function main() {
  const end = process.argv.find((arg) => arg.startsWith('--end='))?.split('=')[1] || '2026-05';
  const start =
    process.argv.find((arg) => arg.startsWith('--start='))?.split('=')[1] ||
    monthKey(addYears(new Date(`${end}-01T00:00:00Z`), -3));

  const fetched = [];
  for (const destination of DESTINATION_TYPES) {
    fetched.push({
      destination,
      ...(await fetchRows({ start, end, destinationType: destination.id })),
    });
  }

  const usRows = normalizeRows(fetched.find((item) => item.destination.id === 'US').rows);
  const refineryRows = normalizeRows(fetched.find((item) => item.destination.id === 'RP').rows);
  const portRows = normalizeRows(fetched.find((item) => item.destination.id === 'PP').rows);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(readmeRows({ start, end, fetched })), 'README');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(GRADES), 'Grade Lookup');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usRows), 'US Total Long');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wideByGrade(usRows, ['Month', 'originName'])), 'US Total Wide');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(refineryRows), 'Refinery PADD Long');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wideByGrade(refineryRows, ['Month', 'originName', 'destinationId', 'destinationName'])), 'Refinery PADD Wide');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(portRows), 'Port PADD Long');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wideByGrade(portRows, ['Month', 'originName', 'destinationId', 'destinationName'])), 'Port PADD Wide');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(countryTotals(usRows)), 'Period Totals');

  const outPath = path.join(OUT_DIR, `crude-oil-imports-api-canada-venezuela-grade-summary-${start}_to_${end}.xlsx`);
  XLSX.writeFile(wb, outPath);

  console.log(JSON.stringify({
    outPath,
    start,
    end,
    usRows: usRows.length,
    refineryPaddRows: refineryRows.length,
    portPaddRows: portRows.length,
    totals: countryTotals(usRows),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
