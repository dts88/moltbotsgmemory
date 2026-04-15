/**
 * 原油裂解产率回归脚本
 * 方法：无约束 NNLS（投影梯度法），yield >= 0
 * 用法：node yield_regression.mjs
 *
 * 修改 PRODUCT_DEFS 和 GPW_SYM 来适配其他原油
 */
import { readFileSync } from 'fs';

const CLAWD_DIR = '/home/node/clawd';
const creds = JSON.parse(readFileSync(`${CLAWD_DIR}/.config/spglobal/credentials.json`, 'utf8'));
const token = creds.access_token;

// ── 配置：修改这里来适配其他原油 ─────────────────────────────────────
const GPW_SYM = 'DBSCY00';     // GPW 符号（如有官方符号则用，否则需要手动算）
const START_1 = '2025-01-01';  // 第一段日期范围
const END_1   = '2025-09-01';
const START_2 = '2025-09-02';  // 第二段日期范围（API 每次最多 167 条）
const END_2   = '2026-03-28';

// 产品定义：name=标识, sym=Platts符号, bbl=换算函数
const PRODUCT_DEFS = [
  { name: 'Propane',    sym: 'AAVAK00', bbl: v => v / 12.480 },
  { name: 'Butane',     sym: 'AAVAN00', bbl: v => v / 10.749 },
  { name: 'Naphtha',    sym: 'PAAAP00', bbl: v => v          },
  { name: '92RON',      sym: 'PGAEY00', bbl: v => v          },
  { name: '97RON',      sym: 'PGAMS00', bbl: v => v          },
  { name: 'Jet',        sym: 'PJABF00', bbl: v => v          },
  { name: 'GO10',       sym: 'AAOVC00', bbl: v => v          },
  { name: 'GO500',      sym: 'AAPPF00', bbl: v => v          },
  { name: 'GO2500',     sym: 'AACUE00', bbl: v => v          },
  { name: 'FO180_2S',   sym: 'PUAXS00', bbl: v => v / 6.35  },
  { name: 'FO180_35S',  sym: 'PUADV00', bbl: v => v / 6.35  },
  { name: 'FO380',      sym: 'PPXDK00', bbl: v => v / 6.35  },
  { name: 'LSWR',       sym: 'AMFSA00', bbl: v => v / 6.80 + 1.0 },
];
// ── 配置结束 ──────────────────────────────────────────────────────────

const M = PRODUCT_DEFS.length;

async function queryOne(sym, start, end) {
  const filter = `symbol:"${sym}" AND assessDate>="${start}" AND assessDate<="${end}"`;
  const url = `https://api.platts.com/market-data/v3/value/history/symbol?filter=${encodeURIComponent(filter)}&pageSize=500`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'appkey': 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN' }
  });
  const data = await res.json();
  const result = {};
  for (const r of (data.results || [])) {
    for (const d of (r.data || [])) {
      if (d.bate !== 'c' && d.bate !== 'u') continue;
      result[d.assessDate.slice(0, 10)] = parseFloat(d.value);
    }
  }
  return result;
}

async function queryFull(sym) {
  const [d1, d2] = await Promise.all([
    queryOne(sym, START_1, END_1),
    queryOne(sym, START_2, END_2),
  ]);
  return { ...d1, ...d2 };
}

// 数据加载
process.stdout.write('拉取数据...\n');
const allData = {};
for (const p of PRODUCT_DEFS) allData[p.sym] = await queryFull(p.sym);
allData[GPW_SYM] = await queryFull(GPW_SYM);

// 构建完整数据行
const rows = [];
for (const date of Object.keys(allData[GPW_SYM]).sort()) {
  const gpw = allData[GPW_SYM][date]; if (!gpw) continue;
  const prices = PRODUCT_DEFS.map(p => {
    const raw = allData[p.sym][date];
    return raw !== undefined ? p.bbl(raw) : null;
  });
  if (prices.some(v => v === null)) continue;
  rows.push({ date, gpw, prices });
}
const N = rows.length;
process.stdout.write(`完整数据: ${N} 天 (${rows[0]?.date} ~ ${rows[N-1]?.date})\n\n`);

// 正规方程
const P = rows.map(r => r.prices);
const y = rows.map(r => r.gpw);
const PtP = Array.from({ length: M }, (_, i) =>
  Array.from({ length: M }, (_, j) => rows.reduce((s, _, n) => s + P[n][i] * P[n][j], 0)));
const Pty = Array.from({ length: M }, (_, i) => rows.reduce((s, _, n) => s + P[n][i] * y[n], 0));

function evalF(yv) {
  return yv.reduce((s, v, i) => s + v * PtP[i].reduce((a, x, j) => a + x * yv[j], 0), 0)
    - 2 * yv.reduce((s, v, i) => s + v * Pty[i], 0);
}
function gradF(yv) {
  return PtP.map((row, i) => 2 * (row.reduce((s, x, j) => s + x * yv[j], 0) - Pty[i]));
}
function proj(yv) { return yv.map(v => Math.max(0, v)); }  // NNLS: only yield >= 0

// 投影梯度法
let curr = proj(new Array(M).fill(1 / M));
for (let iter = 0; iter < 8000; iter++) {
  const g = gradF(curr);
  let alpha = 1.0;
  const f0 = evalF(curr);
  for (let ls = 0; ls < 60; ls++) {
    const next = proj(curr.map((x, j) => x - alpha * g[j]));
    const gdiff = g.reduce((s, gi, j) => s + gi * (curr[j] - next[j]), 0);
    if (evalF(next) <= f0 - 0.5 * alpha * gdiff) { curr = next; break; }
    alpha *= 0.5;
  }
}

// 结果
const sse = rows.reduce((s, r) => { const e = r.prices.reduce((a, p, j) => a + curr[j] * p, 0) - r.gpw; return s + e * e; }, 0);
const rmse = Math.sqrt(sse / N);
const totalY = curr.reduce((a, b) => a + b, 0);

console.log(`=== 产率回归结果 (RMSE=${rmse.toFixed(3)} $/bbl, N=${N}) ===`);
console.log('产品           Symbol    产率       均价$    贡献$');
for (let j = 0; j < M; j++) {
  const p = PRODUCT_DEFS[j];
  const avgP = rows.reduce((s, r) => s + r.prices[j], 0) / N;
  console.log(`${p.name.padEnd(13)}  ${p.sym}  ${(curr[j] * 100).toFixed(2).padStart(6)}%  ${avgP.toFixed(1).padStart(8)}  ${(curr[j] * avgP).toFixed(2).padStart(7)}`);
}
console.log(`${'合计'.padEnd(13)}          ${(totalY * 100).toFixed(2).padStart(6)}%`);
console.log(`${'Petcoke+Loss'.padEnd(13)}          ${((1 - totalY) * 100).toFixed(2).padStart(6)}%`);

// 最后10天验证
console.log('\n最后10天验证:');
console.log('日期\t\tGPW实际\tGPW估算\t误差');
for (const r of rows.slice(-10)) {
  const est = r.prices.reduce((a, p, j) => a + curr[j] * p, 0);
  console.log(`  ${r.date.slice(5)}  ${r.gpw.toFixed(2)}  ${est.toFixed(2)}  ${(est - r.gpw).toFixed(3)}`);
}
