#!/usr/bin/env node
/**
 * GO 10ppm & Jet Kero MOC Analysis
 * 从 Platts eWindow API 直接拉取数据，计算当日 assessment
 *
 * 市场：
 *   ASIA MidDist Swap  → GO/Jet paper swap
 *   ASIA MD (PVO)      → GO 10ppm + Jet physical cargo
 *
 * 用法：node scripts/go-jet-moc-ewindow.mjs [--date=YYYY-MM-DD]
 *
 * 事后校验 symbols：
 *   GO 10ppm Paper M1  : PRFBY00
 *   GO 10ppm Physical  : AAOVC00
 *   Jet Kero Paper M1  : AAPJZ00  ← 非 PRFGT00（已确认）
 *   Jet Kero Physical  : PJABF00
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CONFIG_FILE = join(WORKSPACE, '.config/spglobal/credentials.json');
const API_BASE = 'https://api.platts.com';

// ─── helpers ─────────────────────────────────────────────────────────────────

function loadToken() {
  const creds = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  return creds.access_token;
}

async function queryEwindow(token, filter, pageSize = 300) {
  const url = `${API_BASE}/tradedata/v3/ewindowdata?filter=${encodeURIComponent(filter)}&pageSize=${pageSize}&sort=order_time:asc`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`eWindow ${r.status}: ${filter}`);
  const d = await r.json();
  return d.results || [];
}

function vwap(trades) {
  if (!trades.length) return null;
  const totalVol = trades.reduce((s, x) => s + (x.deal_quantity || 0), 0);
  const totalVal = trades.reduce((s, x) => s + x.price * (x.deal_quantity || 0), 0);
  return totalVol ? totalVal / totalVol : null;
}

function fmtPrice(p, decimals = 2) {
  return p != null ? '$' + p.toFixed(decimals) + '/bbl' : 'N/A';
}

function fmtTime(t) {
  return (t || '').substring(11, 19);
}

function fmtCompany(name) {
  // Shorten long company names
  return (name || '')
    .replace('Gunvor Singapore Pte. Ltd.', 'Gunvor')
    .replace('Vitol Asia Pte Ltd', 'Vitol')
    .replace('Dare Global Limited', 'Dare')
    .replace('DV Trading', 'DV')
    .replace('Union International Trading Pte Ltd', 'Union')
    .replace('Trafigura Pte Ltd.', 'Trafigura')
    .replace('Glencore Singapore Pte. Ltd.', 'Glencore')
    .replace('BP Singapore Pte. Limited', 'BP')
    .replace('Aramco Trading Singapore Pte Ltd', 'Aramco')
    .replace('Ampol Trading Pte. Ltd.', 'Ampol')
    .replace('Unipec Singapore Co., Limited', 'Unipec')
    .replace('ENEOS Corporation', 'ENEOS')
    .replace('OQ Trading Limited', 'OQ')
    .replace('Mercuria Energy Trading SA - Singapore Branch', 'Mercuria')
    .replace(/^Mercuria Asia Resources.*/, 'Mercuria')
    .replace('ERA Commodities Pte. Ltd.', 'ERA')
    .replace(/^ERA Trading.*/, 'ERA')
    .replace('ARB Trading Pte. Ltd.', 'ARB')
    .replace(/^ARB Trading.*/, 'ARB')
    .replace(/^DV Trading.*/, 'DV')
    .replace('Xconnect Energy Pte. Ltd.', 'Xconnect')
    .replace('Onyx Commodities Limited', 'Onyx')
    .replace('Axis Limited', 'Axis')
    .replace(/^DV Trading.*/, 'DV')
    .replace(/^DV,.*/, 'DV')
    .split(' ')[0]; // fallback: first word
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const dateArg = process.argv.find(a => a.startsWith('--date='));
  const today = dateArg ? dateArg.split('=')[1] : new Date().toISOString().split('T')[0];

  const token = loadToken();

  console.error(`[GO/Jet MOC] Querying eWindow for ${today}...`);

  // ── Fetch all data in parallel ──────────────────────────────────────────────
  const [
    goSwapTr, goSwapInact, goSwapAct,
    goBalTr, goSprTr,
    goPhysTr, goPhysInact,
    jetSwapTr, jetSwapInact, jetSwapAct,
    jetSprAct,
    jetPhysTr, jetPhysInact,
  ] = await Promise.all([
    // GO paper swap
    queryEwindow(token, `market="ASIA MidDist Swap" AND order_state="consummated" AND order_date="${today}" AND product="Platts GO"`),
    queryEwindow(token, `market="ASIA MidDist Swap" AND order_state="inactive" AND order_date="${today}" AND product="Platts GO"`),
    queryEwindow(token, `market="ASIA MidDist Swap" AND order_state="active" AND order_date="${today}" AND product="Platts GO"`),
    queryEwindow(token, `market="ASIA MidDist Swap" AND order_state="consummated" AND order_date="${today}" AND product="Platts GO (balmo)"`),
    queryEwindow(token, `market="ASIA MidDist Swap" AND order_state="consummated" AND order_date="${today}" AND product="Platts GO Spr"`),
    // GO physical
    queryEwindow(token, `market="ASIA MD (PVO)" AND order_state="consummated" AND order_date="${today}" AND product="Platts GO 10ppm"`),
    queryEwindow(token, `market="ASIA MD (PVO)" AND order_state="inactive" AND order_date="${today}" AND product="Platts GO 10ppm"`),
    // Jet paper swap
    queryEwindow(token, `market="ASIA MidDist Swap" AND order_state="consummated" AND order_date="${today}" AND product="Platts Jet"`),
    queryEwindow(token, `market="ASIA MidDist Swap" AND order_state="inactive" AND order_date="${today}" AND product="Platts Jet"`),
    queryEwindow(token, `market="ASIA MidDist Swap" AND order_state="active" AND order_date="${today}" AND product="Platts Jet"`),
    queryEwindow(token, `market="ASIA MidDist Swap" AND order_date="${today}" AND product="Platts Jet Spr"`),
    // Jet physical
    queryEwindow(token, `market="ASIA MD (PVO)" AND order_state="consummated" AND order_date="${today}" AND product="Platts Jet"`),
    queryEwindow(token, `market="ASIA MD (PVO)" AND order_state="inactive" AND order_date="${today}" AND product="Platts Jet"`),
  ]);

  // ── GO 10ppm calculations ───────────────────────────────────────────────────
  const goAprTr = goSwapTr.filter(x => x.strip?.includes('Apr') && x.price > 100);
  const goMayTr = goSwapTr.filter(x => x.strip?.includes('May') && x.price > 100);
  const goAprVwap = vwap(goAprTr);

  const goAprInactBids = goSwapInact.filter(x => x.order_type === 'Bid' && x.strip?.includes('Apr')).sort((a, b) => b.price - a.price);
  const goAprInactOffers = goSwapInact.filter(x => x.order_type === 'Offer' && x.strip?.includes('Apr')).sort((a, b) => a.price - b.price);
  const goAprActBids = goSwapAct.filter(x => x.order_type === 'Bid' && x.strip?.includes('Apr')).sort((a, b) => b.price - a.price);
  const goAprActOffers = goSwapAct.filter(x => x.order_type === 'Offer' && x.strip?.includes('Apr')).sort((a, b) => a.price - b.price);

  // M1 assessment: VWAP if trades exist, else inactive mid, else active mid
  let goM1, goM1Source;
  if (goAprVwap) {
    goM1 = goAprVwap;
    goM1Source = `VWAP ${goAprTr.length}笔`;
  } else if (goAprInactBids[0] && goAprInactOffers[0]) {
    goM1 = (goAprInactBids[0].price + goAprInactOffers[0].price) / 2;
    goM1Source = `inactive mid (${goAprInactBids[0].price}/${goAprInactOffers[0].price})`;
  } else if (goAprActBids[0] && goAprActOffers[0]) {
    goM1 = (goAprActBids[0].price + goAprActOffers[0].price) / 2;
    goM1Source = `active mid (${goAprActBids[0].price}/${goAprActOffers[0].price})`;
  } else {
    goM1 = null;
    goM1Source = 'N/A';
  }

  const goBalTrades = goBalTr.sort((a, b) => a.price - b.price);
  const goSprTrades = goSprTr;
  const goPhysBids = goPhysInact.filter(x => x.order_type === 'Bid').sort((a, b) => (b.c1_price || 0) - (a.c1_price || 0));
  const goPhysOffers = goPhysInact.filter(x => x.order_type === 'Offer').sort((a, b) => (a.c1_price || 0) - (b.c1_price || 0));

  // Physical assessment: highest demonstrable bid or trade
  let goPhysAssessment = null, goPhysAssessmentSource = '';
  const goPhysWindowTrades = goPhysTr.filter(x => {
    // only trades within standard 15-30 day window (FOB Straits)
    return x.c1_price != null;
  });
  if (goPhysWindowTrades.length) {
    const best = goPhysWindowTrades.sort((a, b) => (b.c1_price || 0) - (a.c1_price || 0))[0];
    goPhysAssessment = best.c1_price;
    goPhysAssessmentSource = `成交 ${fmtCompany(best.seller)}→${fmtCompany(best.buyer)} [${fmtTime(best.order_time)}]`;
  } else if (goPhysBids.length) {
    goPhysAssessment = goPhysBids[0].c1_price;
    goPhysAssessmentSource = `${fmtCompany(goPhysBids[0].market_maker)} bid（无成交）`;
  }

  // ── Jet calculations ────────────────────────────────────────────────────────
  const jetAprTr = jetSwapTr.filter(x => x.strip?.includes('Apr') && x.price > 100);
  const jetAprVwap = vwap(jetAprTr);

  const jetAprInactBids = jetSwapInact.filter(x => x.order_type === 'Bid' && x.strip?.includes('Apr')).sort((a, b) => b.price - a.price);
  const jetAprInactOffers = jetSwapInact.filter(x => x.order_type === 'Offer' && x.strip?.includes('Apr')).sort((a, b) => a.price - b.price);
  const jetAprActBids = jetSwapAct.filter(x => x.order_type === 'Bid' && x.strip?.includes('Apr')).sort((a, b) => b.price - a.price);
  const jetAprActOffers = jetSwapAct.filter(x => x.order_type === 'Offer' && x.strip?.includes('Apr')).sort((a, b) => a.price - b.price);
  const jetMayInactOffers = jetSwapInact.filter(x => x.order_type === 'Offer' && x.strip?.includes('May')).sort((a, b) => a.price - b.price);

  let jetM1, jetM1Source;
  if (jetAprVwap) {
    jetM1 = jetAprVwap;
    jetM1Source = `VWAP ${jetAprTr.length}笔`;
  } else if (jetAprInactBids[0] && jetAprInactOffers[0]) {
    jetM1 = (jetAprInactBids[0].price + jetAprInactOffers[0].price) / 2;
    jetM1Source = `inactive mid (${jetAprInactBids[0].price}/${jetAprInactOffers[0].price})`;
  } else if (jetAprActBids[0] && jetAprActOffers[0]) {
    jetM1 = (jetAprActBids[0].price + jetAprActOffers[0].price) / 2;
    jetM1Source = `active mid (${jetAprActBids[0].price}/${jetAprActOffers[0].price})`;
  } else if (jetAprActBids[0]) {
    jetM1 = jetAprActBids[0].price;
    jetM1Source = `best active bid (${jetAprActBids[0].price})`;
  } else {
    jetM1 = null;
    jetM1Source = 'N/A';
  }

  // Apr/May spread → M2
  const jetSprActBids = jetSprAct.filter(x => x.order_state === 'active' && x.strip?.includes('Apr') && x.strip?.includes('May') && x.order_type === 'Bid').sort((a, b) => b.price - a.price);
  const jetSprActOffers = jetSprAct.filter(x => x.order_state === 'active' && x.strip?.includes('Apr') && x.strip?.includes('May') && x.order_type === 'Offer').sort((a, b) => a.price - b.price);
  const jetSprInactBids = jetSprAct.filter(x => x.order_state === 'inactive' && x.strip?.includes('Apr') && x.strip?.includes('May') && x.order_type === 'Bid').sort((a, b) => b.price - a.price);
  const jetSprBestBid = jetSprActBids[0]?.price || jetSprInactBids[0]?.price;
  const jetM2 = (jetM1 && jetSprBestBid) ? jetM1 - jetSprBestBid : null;

  // Physical Jet: filter to standard FOB Straits window (Apr laycan)
  const jetPhysWindowTrades = jetPhysTr.filter(x => {
    if (!x.deal_begin) return false;
    const begin = new Date(x.deal_begin);
    const dateObj = new Date(today);
    const daysOut = (begin - dateObj) / 86400000;
    return daysOut >= 10 && daysOut <= 35; // standard 15-30 day window ±5
  });
  const jetPhysAllTrades = jetPhysTr; // keep all for display
  const jetPhysBids = jetPhysInact.filter(x => x.order_type === 'Bid').sort((a, b) => (b.c1_price || 0) - (a.c1_price || 0));
  const jetPhysOffers = jetPhysInact.filter(x => x.order_type === 'Offer').sort((a, b) => (a.c1_price || 0) - (b.c1_price || 0));

  let jetPhysAssessment = null, jetPhysAssessmentSource = '';
  if (jetPhysWindowTrades.length) {
    const best = jetPhysWindowTrades.sort((a, b) => (b.c1_price || 0) - (a.c1_price || 0))[0];
    jetPhysAssessment = best.c1_price;
    jetPhysAssessmentSource = `成交 ${fmtCompany(best.seller)}→${fmtCompany(best.buyer)} ${best.deal_begin}~${best.deal_end} [${fmtTime(best.order_time)}]`;
  } else if (jetPhysBids.length) {
    jetPhysAssessment = jetPhysBids[0].c1_price;
    jetPhysAssessmentSource = `${fmtCompany(jetPhysBids[0].market_maker)} bid（无窗口内成交）`;
  }

  // ── Output ──────────────────────────────────────────────────────────────────
  const dateLabel = new Date(today).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const lines = [];
  lines.push(`Singapore GO 10ppm & Jet Kero MOC — ${dateLabel}`);
  lines.push('');

  // ── GO 10ppm ──
  lines.push('── GO 10ppm ──');
  lines.push('');

  lines.push(`[Paper Swap M1 Apr26]`);
  if (goAprTr.length) {
    lines.push(`成交 ${goAprTr.length}笔 VWAP: ${fmtPrice(goM1)}  [${goM1Source}]`);
    goAprTr.forEach(x => {
      lines.push(`  ${fmtCompany(x.seller)} → ${fmtCompany(x.buyer)}  $${x.price}/bbl  ${x.deal_quantity}kb  [${fmtTime(x.order_time)}]`);
    });
  } else {
    lines.push(`无成交  Assessment: ${fmtPrice(goM1)}  [${goM1Source}]`);
  }

  if (goBalTrades.length) {
    lines.push(`Bal Month: ${goBalTrades.map(x => `${fmtCompany(x.seller)}→${fmtCompany(x.buyer)} $${x.price} ${x.deal_quantity}kb [${fmtTime(x.order_time)}]`).join('  ')}`);
  }
  if (goSprTrades.length) {
    lines.push(`Spread: ${goSprTrades.map(x => `${x.strip} $${x.price}/bbl ${x.deal_quantity}kb`).join('  ')}`);
  }

  const goBestBid = goAprInactBids[0]?.price || goAprActBids[0]?.price;
  const goBestOffer = goAprInactOffers[0]?.price || goAprActOffers[0]?.price;
  if (goBestBid || goBestOffer) {
    lines.push(`收盘订单簿: bid ${goBestBid ? '$' + goBestBid : 'N/A'}（${fmtCompany(goAprInactBids[0]?.market_maker || goAprActBids[0]?.market_maker)}）  offer ${goBestOffer ? '$' + goBestOffer : 'N/A'}（${fmtCompany(goAprInactOffers[0]?.market_maker || goAprActOffers[0]?.market_maker)}）`);
  }

  lines.push('');
  lines.push(`[Physical FOB Straits]`);
  if (goPhysTr.length) {
    lines.push(`成交:`);
    goPhysTr.forEach(x => {
      const diff = x.c1_price_basis + (x.c1_price >= 0 ? '+' : '') + x.c1_price;
      lines.push(`  ${fmtCompany(x.seller)} → ${fmtCompany(x.buyer)}  ${diff}  ${x.deal_quantity}kb  ${x.deal_begin || ''}~${x.deal_end || ''}  [${fmtTime(x.order_time)}]`);
    });
  } else {
    lines.push(`无成交`);
  }
  if (goPhysBids.length) {
    lines.push(`收盘 bids: ${goPhysBids.slice(0, 6).map(x => `${fmtCompany(x.market_maker)} MOPS+${x.c1_price}`).join('  ')}`);
  }
  if (goPhysOffers.length) {
    lines.push(`收盘 offers: ${goPhysOffers.slice(0, 4).map(x => `${fmtCompany(x.market_maker)} MOPS+${x.c1_price}`).join('  ')}`);
  }
  if (goPhysAssessment != null) {
    lines.push(`→ Physical Assessment: MOPS Gasoil +${goPhysAssessment}  (${goPhysAssessmentSource})`);
  }

  lines.push('');
  lines.push('── Jet Kero ──');
  lines.push('');

  lines.push(`[Paper Swap M1 Apr26]`);
  if (jetAprTr.length) {
    lines.push(`成交 ${jetAprTr.length}笔 VWAP: ${fmtPrice(jetM1)}  [${jetM1Source}]`);
    jetAprTr.forEach(x => {
      lines.push(`  ${fmtCompany(x.seller)} → ${fmtCompany(x.buyer)}  $${x.price}/bbl  ${x.deal_quantity}kb  [${fmtTime(x.order_time)}]`);
    });
  } else {
    lines.push(`无成交`);
    if (jetAprActBids[0] || jetAprActOffers[0]) {
      lines.push(`收盘 active: bid ${jetAprActBids[0] ? '$' + jetAprActBids[0].price + ' ' + fmtCompany(jetAprActBids[0].market_maker) + ' [' + fmtTime(jetAprActBids[0].order_time) + ']' : 'N/A'}  offer ${jetAprActOffers[0] ? '$' + jetAprActOffers[0].price + ' ' + fmtCompany(jetAprActOffers[0].market_maker) + ' [' + fmtTime(jetAprActOffers[0].order_time) + ']' : 'N/A'}`);
    }
    if (jetAprInactOffers.length) {
      lines.push(`收盘 inactive offers: ${jetAprInactOffers.map(x => fmtCompany(x.market_maker) + ' $' + x.price).join('  ')}`);
    }
    lines.push(`Assessment: ${fmtPrice(jetM1)}  [${jetM1Source}]`);
  }

  if (jetM2 != null) {
    lines.push(`M2 May26: ${fmtPrice(jetM2)}  (Apr/May spr bid $${jetSprBestBid})`);
  } else if (jetMayInactOffers.length) {
    lines.push(`M2 May26 ref: ${jetMayInactOffers.map(x => fmtCompany(x.market_maker) + ' $' + x.price).join(' / ')} (close offers)`);
  }

  lines.push('');
  lines.push(`[Physical FOB Straits]`);
  if (jetPhysAllTrades.length) {
    lines.push(`成交:`);
    jetPhysAllTrades.forEach(x => {
      const diff = x.c1_price_basis + (x.c1_price >= 0 ? '+' : '') + x.c1_price;
      const inWindow = jetPhysWindowTrades.includes(x);
      lines.push(`  ${fmtCompany(x.seller)} → ${fmtCompany(x.buyer)}  ${diff}  ${x.deal_quantity}kb  ${x.deal_begin || ''}~${x.deal_end || ''}  [${fmtTime(x.order_time)}]${inWindow ? ' ✅' : ' (窗口外)'}`);
    });
  } else {
    lines.push(`无成交`);
  }
  if (jetPhysBids.length) {
    lines.push(`收盘 bids: ${jetPhysBids.slice(0, 5).map(x => `${fmtCompany(x.market_maker)} MOPS+${x.c1_price}`).join('  ')}`);
  }
  if (jetPhysOffers.length) {
    lines.push(`收盘 offers: ${jetPhysOffers.slice(0, 5).map(x => `${fmtCompany(x.market_maker)} MOPS+${x.c1_price}`).join('  ')}`);
  }
  if (jetPhysAssessment != null) {
    lines.push(`→ Physical Assessment: MOPS JET +${jetPhysAssessment}  (${jetPhysAssessmentSource})`);
  }

  lines.push('');
  lines.push('── Summary ──');
  lines.push(`GO 10ppm  Paper M1: ${fmtPrice(goM1)}  Physical: MOPS+${goPhysAssessment ?? 'N/A'}`);
  lines.push(`Jet Kero  Paper M1: ${fmtPrice(jetM1)}  Physical: MOPS+${jetPhysAssessment ?? 'N/A'}`);

  console.log(lines.join('\n'));
}

main().catch(e => {
  console.error('[GO/Jet MOC ERROR]', e.message);
  process.exit(1);
});
