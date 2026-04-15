/**
 * GPW + Cracking Margin 计算器
 * 用给定产率拉最近 N 天数据，输出逐日 GPW / Margin 明细
 * 用法：node gpw_calculator.mjs [days=10]
 */
import { readFileSync } from 'fs';

const CLAWD_DIR = '/home/node/clawd';
const creds = JSON.parse(readFileSync(`${CLAWD_DIR}/.config/spglobal/credentials.json`, 'utf8'));
const token = creds.access_token;

const DAYS = parseInt(process.argv[2] || '10');

// Dubai Singapore 产率（无约束NNLS，307天，RMSE=0.179）
const YIELDS = {
  Propane: 0.0215, Butane: 0.0367, Naphtha: 0.1023,
  '92RON': 0.0868, '97RON': 0.0665, Jet: 0.1380,
  GO10: 0.1476, GO500: 0.0954, GO2500: 0.0868,
  FO180_2S: 0.0259, FO180_35S: 0.0333, FO380: 0.0584,
  LSWR: 0.0694,
};

const PRODUCTS = [
  { name: 'Propane',   key: 'Propane',   sym: 'AAVAK00', bbl: v => v / 12.480 },
  { name: 'Butane',    key: 'Butane',    sym: 'AAVAN00', bbl: v => v / 10.749 },
  { name: 'Naphtha',   key: 'Naphtha',   sym: 'PAAAP00', bbl: v => v          },
  { name: '92 RON',    key: '92RON',     sym: 'PGAEY00', bbl: v => v          },
  { name: '97 RON',    key: '97RON',     sym: 'PGAMS00', bbl: v => v          },
  { name: 'Jet Kero',  key: 'Jet',       sym: 'PJABF00', bbl: v => v          },
  { name: 'GO 10ppm',  key: 'GO10',      sym: 'AAOVC00', bbl: v => v          },
  { name: 'GO 500ppm', key: 'GO500',     sym: 'AAPPF00', bbl: v => v          },
  { name: 'GO2500ppm', key: 'GO2500',    sym: 'AACUE00', bbl: v => v          },
  { name: 'FO180 2%S', key: 'FO180_2S',  sym: 'PUAXS00', bbl: v => v / 6.35  },
  { name: 'FO180 35%S',key: 'FO180_35S', sym: 'PUADV00', bbl: v => v / 6.35  },
  { name: 'FO380 35%S',key: 'FO380',     sym: 'PPXDK00', bbl: v => v / 6.35  },
  { name: 'LSWR',      key: 'LSWR',      sym: 'AMFSA00', bbl: v => v / 6.80 + 1.0 },
];

const EXTRA_SYMS = ['DBSCY00', 'DBSCM00', 'PCAAT00', 'TDDCQ00'];

async function queryRecent(sym, days) {
  // 取最近 days*2 个日历天（保证覆盖足够交易日）
  const end = new Date(); end.setHours(0,0,0,0);
  const start = new Date(end); start.setDate(start.getDate() - days * 2);
  const s = start.toISOString().slice(0,10), e = end.toISOString().slice(0,10);
  const filter = `symbol:"${sym}" AND assessDate>="${s}" AND assessDate<="${e}"`;
  const url = `https://api.platts.com/market-data/v3/value/history/symbol?filter=${encodeURIComponent(filter)}&pageSize=200`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'appkey': 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN' }
  });
  const data = await res.json();
  const result = {};
  for (const r of (data.results || [])) {
    for (const d of (r.data || [])) {
      if (d.bate !== 'c' && d.bate !== 'u') continue;
      result[d.assessDate.slice(0,10)] = parseFloat(d.value);
    }
  }
  return result;
}

const allData = {};
for (const p of PRODUCTS) allData[p.sym] = await queryRecent(p.sym, DAYS);
for (const s of EXTRA_SYMS) allData[s] = await queryRecent(s, DAYS);

// 找有完整数据的日期
const validDates = Object.keys(allData['DBSCY00']).filter(d =>
  PRODUCTS.every(p => allData[p.sym][d] !== undefined)
).sort().slice(-DAYS);

console.log(`=== Dubai Singapore Cracking Margin（最近${DAYS}天）===\n`);
console.log('日期\t\tGPW(估算)\t运费\t\tDubai\t\t估算Margin\t实际Margin\t误差');
for (const date of validDates) {
  let gpw = 0;
  for (const p of PRODUCTS) gpw += YIELDS[p.key] * p.bbl(allData[p.sym][date]);
  const freight = allData['TDDCQ00'][date] || 0;
  const dubai   = allData['PCAAT00'][date] || 0;
  const estM    = gpw - freight - dubai;
  const actM    = allData['DBSCM00'][date] || NaN;
  const err     = isNaN(actM) ? 'N/A' : (estM - actM).toFixed(3);
  console.log(`${date}  ${gpw.toFixed(2).padStart(9)}  ${freight.toFixed(2).padStart(8)}  ${dubai.toFixed(2).padStart(8)}  ${estM.toFixed(2).padStart(12)}  ${(actM||'N/A').toString().padStart(12)}  ${err}`);
}

// 最新一天产品明细
const last = validDates[validDates.length - 1];
if (last) {
  console.log(`\n=== ${last} 产品价格明细 ===`);
  console.log('产品              产率       价格$/bbl    贡献$/bbl');
  let total = 0;
  for (const p of PRODUCTS) {
    const price = p.bbl(allData[p.sym][last]);
    const contrib = YIELDS[p.key] * price;
    total += contrib;
    console.log(`${p.name.padEnd(16)}  ${(YIELDS[p.key]*100).toFixed(2).padStart(6)}%  ${price.toFixed(2).padStart(11)}  ${contrib.toFixed(3).padStart(11)}`);
  }
  const freight = allData['TDDCQ00'][last];
  const dubai   = allData['PCAAT00'][last];
  console.log(`${'GPW'.padEnd(16)}            ${''.padStart(11)}  ${total.toFixed(3).padStart(11)}`);
  console.log(`${'− 运费'.padEnd(16)}            ${''.padStart(11)}  ${('-'+freight.toFixed(2)).padStart(11)}`);
  console.log(`${'− Dubai'.padEnd(16)}            ${''.padStart(11)}  ${('-'+dubai.toFixed(2)).padStart(11)}`);
  console.log(`${'= Margin(估算)'.padEnd(16)}            ${''.padStart(11)}  ${(total-freight-dubai).toFixed(3).padStart(11)}`);
  console.log(`${'= DBSCM00(实际)'.padEnd(16)}            ${''.padStart(11)}  ${(allData['DBSCM00'][last]||'N/A').toString().padStart(11)}`);
}
