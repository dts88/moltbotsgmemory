#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const BASE_URL = 'https://www.eia.gov';
const OUT_DIR = path.join(rootDir, 'reports', 'eia');
const CACHE_DIR = path.join(rootDir, '.cache', 'eia-company-imports');

const COUNTRY_NAMES = new Set(['CANADA', 'VENEZUELA']);
const CRUDE_PRODUCT_CODE = '025';

const GRADE_DEFINITIONS = [
  { gradeId: 'LSW', gradeName: 'Light Sweet', gravity: 'API >= 35', sulfur: 'Sulfur <= 0.5%' },
  { gradeId: 'LSO', gradeName: 'Light Sour', gravity: 'API >= 35', sulfur: 'Sulfur > 0.5%' },
  { gradeId: 'MED', gradeName: 'Medium', gravity: '27 < API < 35', sulfur: 'Any sulfur' },
  { gradeId: 'HSW', gradeName: 'Heavy Sweet', gravity: 'API <= 27', sulfur: 'Sulfur <= 0.5%' },
  { gradeId: 'HSO', gradeName: 'Heavy Sour', gravity: 'API <= 27', sulfur: 'Sulfur > 0.5%' },
  { gradeId: 'UNK', gradeName: 'Unknown', gravity: 'Missing/invalid API', sulfur: 'Missing/invalid sulfur' },
];

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function addYears(date, years) {
  const copy = new Date(date);
  copy.setUTCFullYear(copy.getUTCFullYear() + years);
  return copy;
}

function excelSerialToMonth(value) {
  if (value instanceof Date) return monthKey(value);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}`;
  }
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})[-/](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}` : null;
}

function classifyGrade(apiGravity, sulfur) {
  const api = Number(apiGravity);
  const s = Number(sulfur);
  if (!Number.isFinite(api) || !Number.isFinite(s) || api <= 0) {
    return { gradeId: 'UNK', gradeName: 'Unknown' };
  }
  if (api > 27 && api < 35) return { gradeId: 'MED', gradeName: 'Medium' };
  if (api <= 27) return s <= 0.5 ? { gradeId: 'HSW', gradeName: 'Heavy Sweet' } : { gradeId: 'HSO', gradeName: 'Heavy Sour' };
  return s <= 0.5 ? { gradeId: 'LSW', gradeName: 'Light Sweet' } : { gradeId: 'LSO', gradeName: 'Light Sour' };
}

function sourceFilesForRange(startMonth, endMonth) {
  const startYear = Number(startMonth.slice(0, 4));
  const endYear = Number(endMonth.slice(0, 4));
  const currentYear = new Date().getUTCFullYear();
  const files = [];

  for (let year = startYear; year <= endYear; year += 1) {
    if (year <= currentYear - 2 || year === 2024 || year === 2023) {
      files.push({
        year,
        month: null,
        url: `${BASE_URL}/petroleum/imports/companylevel/archive/${year}/data/impa${String(year).slice(2)}d.xlsx`,
        localName: `impa${String(year).slice(2)}d.xlsx`,
      });
    } else {
      const firstMonth = year === startYear ? Number(startMonth.slice(5, 7)) : 1;
      const lastMonth = year === endYear ? Number(endMonth.slice(5, 7)) : 12;
      for (let month = firstMonth; month <= lastMonth; month += 1) {
        const mm = String(month).padStart(2, '0');
        files.push({
          year,
          month,
          url: `${BASE_URL}/petroleum/imports/companylevel/archive/${year}/${year}_${mm}/data/import.xlsx`,
          localName: `${year}_${mm}_import.xlsx`,
        });
      }
    }
  }

  return files;
}

async function downloadFile(source) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const dest = path.join(CACHE_DIR, source.localName);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;

  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${source.url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(dest, buffer);
  return dest;
}

function normalizeRow(row, source) {
  const period = excelSerialToMonth(row.RPT_PERIOD);
  const quantity = Number(row.QUANTITY);
  const sulfur = Number(row.SULFUR);
  const apiGravity = Number(row.APIGRAVITY);
  const grade = classifyGrade(apiGravity, sulfur);

  return {
    Month: period,
    Country: row.CNTRY_NAME,
    'Country Code': row.GCTRY_CODE,
    gradeId: grade.gradeId,
    gradeName: grade.gradeName,
    'Quantity (kbbl)': Number.isFinite(quantity) ? quantity : null,
    'Sulfur (%)': Number.isFinite(sulfur) ? sulfur : null,
    'API Gravity': Number.isFinite(apiGravity) ? apiGravity : null,
    'Importing Company': row.R_S_NAME || '',
    'Line Num': row.LINE_NUM || '',
    'Product Code': row.PROD_CODE || '',
    'Product Name': row.PROD_NAME || '',
    'Port Code': row.PORT_CODE || '',
    'Port City': row.PORT_CITY || '',
    'Port State': row.PORT_STATE || '',
    'Port PADD': row.PORT_PADD || '',
    'Processing Company': row.PCOMP_RNAM || '',
    'Processing Site ID': row.PCOMP_SITEID || '',
    'Processing Site': row.PCOMP_SNAM || '',
    'Processing State': row.PCOMP_STAT || '',
    'Processing PADD': row.PCOMP_PADD || '',
    'Source URL': source.url,
  };
}

function readRows(filePath, source, startMonth, endMonth) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return rows
    .filter((row) => String(row.PROD_CODE || '').padStart(3, '0') === CRUDE_PRODUCT_CODE)
    .filter((row) => COUNTRY_NAMES.has(String(row.CNTRY_NAME || '').toUpperCase()))
    .map((row) => normalizeRow(row, source))
    .filter((row) => row.Month && row.Month >= startMonth && row.Month <= endMonth);
}

function groupRows(rows, dimensions) {
  const map = new Map();
  for (const row of rows) {
    const key = dimensions.map((dim) => row[dim] ?? '').join('|');
    if (!map.has(key)) {
      const item = Object.fromEntries(dimensions.map((dim) => [dim, row[dim] ?? '']));
      item['Quantity (kbbl)'] = 0;
      item['Rows'] = 0;
      item['Weighted API Gravity'] = 0;
      item['Weighted Sulfur (%)'] = 0;
      map.set(key, item);
    }
    const current = map.get(key);
    const qty = Number(row['Quantity (kbbl)']) || 0;
    current['Quantity (kbbl)'] += qty;
    current.Rows += 1;
    current['Weighted API Gravity'] += qty * (Number(row['API Gravity']) || 0);
    current['Weighted Sulfur (%)'] += qty * (Number(row['Sulfur (%)']) || 0);
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      'Quantity (kbbl)': Math.round(row['Quantity (kbbl)'] * 1000) / 1000,
      'Avg (kb/d)': Math.round((row['Quantity (kbbl)'] / daysInMonth(row.Month)) * 1000) / 1000,
      'Weighted API Gravity': row['Quantity (kbbl)'] ? Math.round((row['Weighted API Gravity'] / row['Quantity (kbbl)']) * 1000) / 1000 : null,
      'Weighted Sulfur (%)': row['Quantity (kbbl)'] ? Math.round((row['Weighted Sulfur (%)'] / row['Quantity (kbbl)']) * 1000) / 1000 : null,
    }))
    .sort((a, b) => dimensions.map((dim) => String(a[dim]).localeCompare(String(b[dim]))).find(Boolean) || 0);
}

function daysInMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function wideCountryGradeRows(summaryRows) {
  const gradeIds = ['LSW', 'LSO', 'MED', 'HSW', 'HSO', 'UNK'];
  const map = new Map();
  for (const row of summaryRows) {
    const key = `${row.Month}|${row.Country}`;
    if (!map.has(key)) map.set(key, { Month: row.Month, Country: row.Country });
    const current = map.get(key);
    current[`${row.gradeId} ${row.gradeName} (kbbl)`] = row['Quantity (kbbl)'];
    current[`${row.gradeId} ${row.gradeName} (kb/d)`] = row['Avg (kb/d)'];
  }
  return [...map.values()]
    .map((row) => {
      for (const gradeId of gradeIds) {
        const def = GRADE_DEFINITIONS.find((item) => item.gradeId === gradeId);
        row[`${gradeId} ${def.gradeName} (kbbl)`] ??= 0;
        row[`${gradeId} ${def.gradeName} (kb/d)`] ??= 0;
      }
      return row;
    })
    .sort((a, b) => a.Month.localeCompare(b.Month) || a.Country.localeCompare(b.Country));
}

function readmeRows(startMonth, endMonth, files) {
  return [
    { Field: 'Source', Value: 'EIA Company Level Imports' },
    { Field: 'Source URL', Value: 'https://www.eia.gov/petroleum/imports/companylevel/' },
    { Field: 'Period requested', Value: `${startMonth} to ${endMonth}` },
    { Field: 'Countries', Value: 'Canada, Venezuela' },
    { Field: 'Product filter', Value: 'PROD_CODE=025, PROD_NAME=Crude Oil' },
    { Field: 'Unit', Value: 'QUANTITY is thousand barrels (kbbl); kb/d is derived as kbbl / calendar days in month' },
    { Field: 'Grade source', Value: 'Derived from APIGRAVITY and SULFUR fields in EIA company-level files' },
    { Field: 'Grade IDs', Value: GRADE_DEFINITIONS.map((item) => `${item.gradeId}=${item.gradeName}`).join('; ') },
    { Field: 'Caveat', Value: 'Monthly official/company-level data; not directly comparable to weekly preliminary WIMPC rows by week.' },
    { Field: 'Downloaded files', Value: files.map((file) => file.url).join('\n') },
  ];
}

async function main() {
  const now = new Date();
  const defaultEnd = '2026-05';
  const end = process.argv.find((arg) => arg.startsWith('--end='))?.split('=')[1] || defaultEnd;
  const start =
    process.argv.find((arg) => arg.startsWith('--start='))?.split('=')[1] ||
    monthKey(addYears(new Date(`${end}-01T00:00:00Z`), -3));

  const sources = sourceFilesForRange(start, end);
  const allRows = [];
  for (const source of sources) {
    const filePath = await downloadFile(source);
    allRows.push(...readRows(filePath, source, start, end));
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const generatedAt = now.toISOString();
  const countryGrade = groupRows(allRows, ['Month', 'Country', 'gradeId', 'gradeName']);
  const paddCountryGrade = groupRows(allRows, ['Month', 'Processing PADD', 'Country', 'gradeId', 'gradeName']);
  const portPaddCountryGrade = groupRows(allRows, ['Month', 'Port PADD', 'Country', 'gradeId', 'gradeName']);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(readmeRows(start, end, sources)), 'README');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(GRADE_DEFINITIONS), 'Grade Definitions');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(countryGrade), 'Monthly Country Grade');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wideCountryGradeRows(countryGrade)), 'Wide Country Grade');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paddCountryGrade), 'Processing PADD Grade');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(portPaddCountryGrade), 'Port PADD Grade');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows), 'Raw Company Imports');

  wb.Props = {
    Title: 'EIA Canada and Venezuela Crude Imports by Grade',
    Subject: 'Company Level Imports crude oil by API/sulfur grade',
    Author: 'OpenClaw',
    CreatedDate: new Date(generatedAt),
  };

  const outPath = path.join(OUT_DIR, `company-crude-imports-canada-venezuela-by-grade-${start}_to_${end}.xlsx`);
  XLSX.writeFile(wb, outPath);

  console.log(JSON.stringify({
    outPath,
    start,
    end,
    rawRows: allRows.length,
    countryGradeRows: countryGrade.length,
    paddCountryGradeRows: paddCountryGrade.length,
    sources: sources.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
