import XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'fs';

const workbook = XLSX.readFile('reports/knowledge/20250123_CNPC_Energy_Data_Handbook_2025.xlsx');

function getSheetData(name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) return null;
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

// Helper to parse numeric values
function parseNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }
  return null;
}

const kbEntries = [];

// ========== I-3.1: World Oil Reserves ==========
{
  const data = getSheetData('I-3.1');
  const years = [2000, 2010, 2019, 2020, 2021, 2022, 2023, 2024];
  const reserves = {};
  
  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    const country = row[0]?.toString().trim();
    if (!country || country.includes('数据来源') || country.includes('注：')) continue;
    
    const values = {};
    years.forEach((y, idx) => {
      const v = parseNum(row[1 + idx]);
      if (v !== null) values[y] = v;
    });
    
    if (Object.keys(values).length > 0 && values[2024]) {
      reserves[country] = values;
    }
  }
  
  // Extract top countries for 2024
  const top2024 = Object.entries(reserves)
    .filter(([k, v]) => v[2024] && !k.includes('合计') && !k.includes('世界'))
    .sort((a, b) => b[1][2024] - a[1][2024])
    .slice(0, 15);
  
  kbEntries.push({
    entity: '世界石油储量',
    type: 'reserves',
    source: 'CNPC ETRI',
    sourceDoc: 'CNPC Energy Data Handbook 2025',
    date: '2025-01-23',
    unit: '亿吨',
    data: {
      world2024: reserves['世界']?.[2024],
      top15_2024: Object.fromEntries(top2024.map(([k, v]) => [k, v[2024]])),
      timeSeries: reserves
    }
  });
}

// ========== I-3.2: World Crude Production ==========
{
  const data = getSheetData('I-3.2');
  const years = [2000, 2010, 2019, 2020, 2021, 2022, 2023, 2024];
  const production = {};
  
  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    const country = row[0]?.toString().trim();
    if (!country || country.includes('数据来源') || country.includes('注：')) continue;
    
    const values = {};
    years.forEach((y, idx) => {
      const v = parseNum(row[1 + idx]);
      if (v !== null) values[y] = v;
    });
    
    if (Object.keys(values).length > 0 && values[2024]) {
      production[country] = values;
    }
  }
  
  const top2024 = Object.entries(production)
    .filter(([k, v]) => v[2024] && !k.includes('合计') && !k.includes('世界'))
    .sort((a, b) => b[1][2024] - a[1][2024])
    .slice(0, 15);
  
  kbEntries.push({
    entity: '世界原油产量',
    type: 'production',
    source: 'CNPC ETRI',
    sourceDoc: 'CNPC Energy Data Handbook 2025',
    date: '2025-01-23',
    unit: '万吨',
    data: {
      world2024: production['世界']?.[2024],
      top15_2024: Object.fromEntries(top2024.map(([k, v]) => [k, v[2024]])),
      timeSeries: production
    }
  });
}

// ========== I-3.5: World Refining Capacity ==========
{
  const data = getSheetData('I-3.5');
  const years = [2000, 2010, 2019, 2020, 2021, 2022, 2023, 2024];
  const refining = {};
  
  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    const country = row[0]?.toString().trim();
    if (!country || country.includes('数据来源') || country.includes('注：')) continue;
    
    const values = {};
    years.forEach((y, idx) => {
      const v = parseNum(row[1 + idx]);
      if (v !== null) values[y] = v;
    });
    
    if (Object.keys(values).length > 0 && values[2024]) {
      refining[country] = values;
    }
  }
  
  const top2024 = Object.entries(refining)
    .filter(([k, v]) => v[2024] && !k.includes('合计') && !k.includes('世界'))
    .sort((a, b) => b[1][2024] - a[1][2024])
    .slice(0, 15);
  
  kbEntries.push({
    entity: '世界炼油能力',
    type: 'capacity',
    source: 'CNPC ETRI',
    sourceDoc: 'CNPC Energy Data Handbook 2025',
    date: '2025-01-23',
    unit: '万吨/年',
    data: {
      world2024: refining['世界']?.[2024],
      top15_2024: Object.fromEntries(top2024.map(([k, v]) => [k, v[2024]])),
      timeSeries: refining
    }
  });
}

// ========== II-3.3: China Refining by Province ==========
{
  const data = getSheetData('II-3.3');
  const years = [2010, 2015, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const provinces = {};
  
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    const province = row[0]?.toString().trim();
    if (!province || province.includes('数据来源') || province === '合计') continue;
    
    const values = {};
    years.forEach((y, idx) => {
      const v = parseNum(row[1 + idx]);
      if (v !== null) values[y] = v;
    });
    
    if (Object.keys(values).length > 0) {
      provinces[province] = values;
    }
  }
  
  const top2024 = Object.entries(provinces)
    .filter(([k, v]) => v[2024])
    .sort((a, b) => b[1][2024] - a[1][2024])
    .slice(0, 10);
  
  kbEntries.push({
    entity: '中国分省炼油能力',
    type: 'capacity',
    source: 'CNPC ETRI',
    sourceDoc: 'CNPC Energy Data Handbook 2025',
    date: '2025-01-23',
    unit: '万吨/年',
    data: {
      top10_2024: Object.fromEntries(top2024.map(([k, v]) => [k, v[2024]])),
      byProvince: provinces
    }
  });
}

// ========== II-3.2: China Refining by Company ==========
{
  const data = getSheetData('II-3.2');
  console.log('II-3.2 sample:', data.slice(0, 8).map(r => r.slice(0, 5)));
}

// ========== III-1.3: World Oil Outlook ==========
{
  const data = getSheetData('III-1.3');
  const years = [2030, 2035, 2040, 2045, 2050, 2055, 2060];
  
  // Parse demand section (rows 4-9)
  const demand = {};
  for (let i = 4; i < 10; i++) {
    const row = data[i];
    const region = row[0]?.toString().trim();
    if (!region) continue;
    
    const values = {};
    years.forEach((y, idx) => {
      const v = parseNum(row[1 + idx]);
      if (v !== null) values[y] = v;
    });
    demand[region] = values;
  }
  
  kbEntries.push({
    entity: '世界石油需求展望',
    type: 'outlook',
    scenario: '基准情景',
    source: 'CNPC ETRI',
    sourceDoc: 'CNPC Energy Data Handbook 2025',
    date: '2025-01-23',
    unit: '亿吨',
    horizon: '2030-2060',
    data: demand
  });
}

// ========== III-2.3: China Oil/Gas Outlook ==========
{
  const data = getSheetData('III-2.3');
  const years = [2030, 2035, 2040, 2045, 2050, 2055, 2060];
  
  const chinaOutlook = {
    原油产量: { unit: '亿吨' },
    石油需求: { unit: '亿吨' },
    天然气产量: { unit: '亿立方米' },
    天然气需求: { unit: '亿立方米' }
  };
  
  for (let i = 4; i < 8; i++) {
    const row = data[i];
    const metric = row[0]?.toString().replace(/（.*）/, '').trim();
    if (!metric || !chinaOutlook[metric]) continue;
    
    years.forEach((y, idx) => {
      const v = parseNum(row[1 + idx]);
      if (v !== null) chinaOutlook[metric][y] = v;
    });
  }
  
  kbEntries.push({
    entity: '中国油气供需展望',
    type: 'outlook',
    scenario: '基准情景',
    source: 'CNPC ETRI',
    sourceDoc: 'CNPC Energy Data Handbook 2025',
    date: '2025-01-23',
    horizon: '2030-2060',
    data: chinaOutlook
  });
}

// ========== I-2.4: World Oil Consumption ==========
{
  const data = getSheetData('I-2.4');
  const years = [2000, 2010, 2019, 2020, 2021, 2022, 2023, 2024];
  const consumption = {};
  
  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    const country = row[0]?.toString().trim();
    if (!country || country.includes('数据来源') || country.includes('注：')) continue;
    
    const values = {};
    years.forEach((y, idx) => {
      const v = parseNum(row[1 + idx]);
      if (v !== null) values[y] = v;
    });
    
    if (Object.keys(values).length > 0 && values[2024]) {
      consumption[country] = values;
    }
  }
  
  const top2024 = Object.entries(consumption)
    .filter(([k, v]) => v[2024] && !k.includes('合计') && !k.includes('世界'))
    .sort((a, b) => b[1][2024] - a[1][2024])
    .slice(0, 15);
  
  kbEntries.push({
    entity: '世界石油消费',
    type: 'consumption',
    source: 'CNPC ETRI',
    sourceDoc: 'CNPC Energy Data Handbook 2025',
    date: '2025-01-23',
    unit: '万吨',
    data: {
      world2024: consumption['世界']?.[2024],
      top15_2024: Object.fromEntries(top2024.map(([k, v]) => [k, v[2024]])),
      timeSeries: consumption
    }
  });
}

// Save to knowledge base
const kb = JSON.parse(readFileSync('reports/knowledge-base.json', 'utf8'));
kb.cnpcHandbook2025 = {
  source: 'CNPC ETRI',
  title: '中石油经研院能源数据手册 2025',
  date: '2025-01-23',
  files: {
    pdf: 'knowledge/20250123_CNPC_Energy_Data_Handbook_2025.pdf',
    xlsx: 'knowledge/20250123_CNPC_Energy_Data_Handbook_2025.xlsx'
  },
  coverage: {
    historical: '2000-2024',
    forecast: '2030-2060',
    regions: ['世界', '北美', '中南美', '欧洲及欧亚', '中东', '非洲', '亚太'],
    countries: '主要国家',
    chinaDetail: '分省分公司'
  },
  datasets: kbEntries
};

writeFileSync('reports/knowledge-base.json', JSON.stringify(kb, null, 2));
console.log(`\n✓ Added ${kbEntries.length} datasets to knowledge base`);
console.log('Datasets:', kbEntries.map(e => e.entity).join(', '));

// Add II-3.2: China refining by company - fix parsing
