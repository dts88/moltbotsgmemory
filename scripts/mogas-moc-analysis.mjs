#!/usr/bin/env node
/**
 * Singapore Mogas MOC Assessment Analysis
 * Fetches and analyzes Asia Mogas Physical + Swap post-MOC heards
 * Calculates: Assessment, Strip prices, Daily structure
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CONFIG_FILE = join(WORKSPACE, '.config/spglobal/credentials.json');
const API_BASE = 'https://api.platts.com';
const APPKEY = 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN';

function loadToken() {
  const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  return config.access_token;
}

async function apiGet(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'appkey': APPKEY }
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

async function fetchContent(id, token) {
  const data = await apiGet(`/news-insights/v1/content/${id}`, token);
  return data.envelope?.content?.body?.replace(/<[^>]+>/g, '') || '';
}

async function searchHeards(q, token, pages = 5) {
  const results = [];
  for (let page = 1; page <= pages; page++) {
    const data = await apiGet(
      `/news-insights/v1/search/heards?q=${encodeURIComponent(q)}&pageSize=50&page=${page}`,
      token
    );
    const items = data.results || [];
    results.push(...items);
    if (items.length < 50) break;
  }
  return results;
}

// Filter heards for today's date in UTC
function todayUTC() {
  return new Date().toISOString().split('T')[0];
}

// Parse physical cargo MOC (100KB lots, FOB Straits)
function parseCargoMOC(body) {
  const result = { trades: [], bids: [], offers: [], withdrawals: [] };
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  let section = '';
  
  for (const line of lines) {
    if (line.includes('TRADES SUMMARY')) section = 'trades';
    else if (line.includes('BIDS ON CLOSE')) section = 'bids';
    else if (line.includes('OFFERS ON CLOSE')) section = 'offers';
    else if (line.includes('WITHDRAWALS')) section = 'withdrawals';
    else if (line.includes('NO TRADES REPORTED') || line.includes('No bids') || line.includes('No offers') || line.includes('No trades')) {
      // skip
    } else if (line.match(/PLATTS MOGAS \d+.*\$[\d.]+\/bbl/)) {
      // Parse: PLATTS MOGAS 92 (100KB): MAR27-MAR31: SKEISG: BIDS: 100kb: FOB Straits $112.50/bbl
      // Or: PLATTS MOGAS 92 (100KB): MAR27-MAR31: FREEPTASIA* SOLD TO DARE 100kb $112.00/bbl (8:29:49)
      const gradeMatch = line.match(/MOGAS (\d+)/);
      const priceMatch = line.match(/\$([\d.]+)\/bbl/);
      const laycanMatch = line.match(/: ([A-Z]{3}\d+-[A-Z]{3}\d+):/);
      const buyerMatch = line.match(/SOLD TO (\w+)/);
      const sellerMatch = line.match(/(\w+)\*? SOLD TO/);
      const timeMatch = line.match(/\((\d+:\d+:\d+)\)/);
      
      const entry = {
        grade: gradeMatch ? gradeMatch[1] : '?',
        price: priceMatch ? parseFloat(priceMatch[1]) : null,
        laycan: laycanMatch ? laycanMatch[1] : null,
        raw: line
      };
      if (buyerMatch) entry.buyer = buyerMatch[1];
      if (sellerMatch) entry.seller = sellerMatch[1];
      if (timeMatch) entry.time = timeMatch[1];
      
      if (section === 'trades') result.trades.push(entry);
      else if (section === 'bids') result.bids.push(entry);
      else if (section === 'offers') result.offers.push(entry);
      else if (section === 'withdrawals') result.withdrawals.push(entry);
    }
  }
  return result;
}

// Parse paper/swap MOC
function parsePaperMOC(body) {
  const result = { trades: [], bids: [], offers: [], withdrawals: [], spreadTrades: [], spreadBids: [] };
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  let section = '';
  let isSpread = false;
  
  for (const line of lines) {
    if (line.includes('PLATTS ASIA MOGAS PAPER SPREADS')) isSpread = true;
    if (line.includes('TRADES SUMMARY')) section = 'trades';
    else if (line.includes('BIDS ON CLOSE')) section = 'bids';
    else if (line.includes('OFFERS ON CLOSE')) section = 'offers';
    else if (line.includes('WITHDRAWALS')) section = 'withdrawals';
    else if (line.match(/PLATTS MOGAS \d+.*\$[\d.]+\/bbl/) || line.match(/PLATTS MOGAS \d+ SPREAD.*\$[\d.-]+\/bbl/)) {
      const gradeMatch = line.match(/MOGAS (\d+)/);
      const priceMatch = line.match(/\$([\d.-]+)\/bbl/);
      const monthMatch = line.match(/: ([A-Z0-9/]+):/);
      const buyerMatch = line.match(/SOLD TO (\w+)/);
      const sellerMatch = line.match(/(\w+)\*? SOLD TO/);
      const timeMatch = line.match(/\((\d+:\d+:\d+)\)/);
      
      const entry = {
        grade: gradeMatch ? gradeMatch[1] : '?',
        price: priceMatch ? parseFloat(priceMatch[1]) : null,
        month: monthMatch ? monthMatch[1] : null,
        raw: line
      };
      if (buyerMatch) entry.buyer = buyerMatch[1];
      if (sellerMatch) entry.seller = sellerMatch[1];
      if (timeMatch) entry.time = timeMatch[1];
      
      if (isSpread) {
        if (section === 'trades') result.spreadTrades.push(entry);
        else if (section === 'bids') result.spreadBids.push(entry);
      } else {
        if (section === 'trades') result.trades.push(entry);
        else if (section === 'bids') result.bids.push(entry);
        else if (section === 'offers') result.offers.push(entry);
        else if (section === 'withdrawals') result.withdrawals.push(entry);
      }
    }
  }
  return result;
}

// Parse indicative values (3pm)
function parseIndicativeValues(bodies) {
  const result = { swaps: {}, cracks: {}, spreads: {} };
  
  for (const body of bodies) {
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Gasoline 118.28 107.28 101.38
      const gasolineMatch = line.match(/^Gasoline\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
      if (gasolineMatch) {
        result.swaps['92_M1'] = parseFloat(gasolineMatch[1]);
        result.swaps['92_M2'] = parseFloat(gasolineMatch[2]);
        result.swaps['92_M3'] = parseFloat(gasolineMatch[3]);
      }
      // Gasoline/Dubai 23.18 18.23 15.24
      const crackDubaiMatch = line.match(/^Gasoline\/Dubai\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
      if (crackDubaiMatch) {
        result.cracks['Dubai_M1'] = parseFloat(crackDubaiMatch[1]);
        result.cracks['Dubai_M2'] = parseFloat(crackDubaiMatch[2]);
        result.cracks['Dubai_M3'] = parseFloat(crackDubaiMatch[3]);
      }
      // Gasoline/Brent swaps 24.31 17.23 14.66
      const crackBrentMatch = line.match(/^Gasoline\/Brent\s+swaps?\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
      if (crackBrentMatch) {
        result.cracks['Brent_M1'] = parseFloat(crackBrentMatch[1]);
        result.cracks['Brent_M2'] = parseFloat(crackBrentMatch[2]);
        result.cracks['Brent_M3'] = parseFloat(crackBrentMatch[3]);
      }
      // Dubai swaps 95.10 89.05 86.14
      const dubaiMatch = line.match(/^Dubai swaps?\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
      if (dubaiMatch) {
        result.swaps['Dubai_M1'] = parseFloat(dubaiMatch[1]);
        result.swaps['Dubai_M2'] = parseFloat(dubaiMatch[2]);
        result.swaps['Dubai_M3'] = parseFloat(dubaiMatch[3]);
      }
      // ICE Brent futures 97.99 97.99 93.97
      const brentMatch = line.match(/^ICE Brent\s+futures?\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
      if (brentMatch) {
        result.swaps['Brent_M1'] = parseFloat(brentMatch[1]);
        result.swaps['Brent_M2'] = parseFloat(brentMatch[2]);
        result.swaps['Brent_M3'] = parseFloat(brentMatch[3]);
      }
    }
  }
  return result;
}

// Parse UPDATE PLATTS MOGAS heards (final assessments)
function parseUpdateMogas(bodies) {
  const result = { cracks: {}, swaps: {}, notional: {} };
  
  for (const body of bodies) {
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      // FOB Sing 92 RON notional crack/ICE Brent $30.95
      const crackMatch = line.match(/FOB (Sing|Fuj) (\d+) RON.*?crack\/ICE Brent \$([\d.]+)/i);
      if (crackMatch) {
        const key = `${crackMatch[1].toLowerCase()}_${crackMatch[2]}RON_crackBrent`;
        result.cracks[key] = parseFloat(crackMatch[3]);
      }
      // FOB Sing 92 RON swap: April pegged at 118.28
      const swapMatch = line.match(/FOB (Sing|Fuj) (\d+) RON swap: (\w+)\s+pegged at ([\d.]+)/i);
      if (swapMatch) {
        const key = `${swapMatch[1].toLowerCase()}_${swapMatch[2]}RON_${swapMatch[3]}`;
        result.swaps[key] = parseFloat(swapMatch[4]);
      }
      // FOB Sing 92 RON swap: Bal Mar/Apr pegged at 12.00
      const spreadMatch = line.match(/FOB (Sing|Fuj) (\d+) RON swap: ([A-Za-z/ ]+) pegged at ([\d.]+)/i);
      if (spreadMatch && spreadMatch[3].includes('/')) {
        const key = `${spreadMatch[1].toLowerCase()}_${spreadMatch[2]}RON_spread_${spreadMatch[3].trim().replace(/\s+/g, '_')}`;
        result.swaps[key] = parseFloat(spreadMatch[4]);
      }
      // FOB Sing 92 RON notional Mar 27-Mar 31 $128.96 OR MOPS 92 +4.54
      const notionalMatch = line.match(/FOB (Sing|Fuj) (\d+) RON [Nn]otional ([A-Za-z\s\d-]+)\$([\d.]+)\s+OR (MOPS|MOPAG) \d+ \+([\d.]+)/);
      if (notionalMatch) {
        const key = `${notionalMatch[1].toLowerCase()}_${notionalMatch[2]}RON_notional_${notionalMatch[3].trim()}`;
        result.notional[key] = { 
          price: parseFloat(notionalMatch[4]), 
          premium: parseFloat(notionalMatch[6]),
          basis: notionalMatch[5]
        };
      }
    }
  }
  return result;
}

// Apply MOC assessment methodology
function calculateAssessment(cargo, paper, indicative, updateMogas, date) {
  const assessments = {};
  
  // === 92 RON ===
  // Physical Assessment (FOB Singapore/Straits, 15-30 day forward)
  const cargoTrades92 = cargo.trades.filter(t => t.grade === '92');
  const cargoBids92 = cargo.bids.filter(b => b.grade === '92');
  const cargoOffers92 = cargo.offers.filter(o => o.grade === '92');
  
  let physical92 = null;
  let physical92Source = '';
  
  if (cargoTrades92.length > 0) {
    // VWAP of confirmed trades
    const total = cargoTrades92.reduce((s, t) => s + t.price, 0);
    physical92 = total / cargoTrades92.length;
    physical92Source = `${cargoTrades92.length} trade(s)`;
  } else if (cargoBids92.length > 0) {
    // Highest confirmed bid
    physical92 = Math.max(...cargoBids92.map(b => b.price));
    physical92Source = 'highest bid (no trades)';
  } else if (cargoOffers92.length > 0) {
    // Lowest offer
    physical92 = Math.min(...cargoOffers92.map(o => o.price));
    physical92Source = 'lowest offer (no trades/bids)';
  }
  
  // Swap Assessment (92 RON, M1)
  const paperTrades92M1 = paper.trades.filter(t => t.grade === '92' && t.month?.includes('APR'));
  const paperBids92M1 = paper.bids.filter(b => b.grade === '92' && b.month?.includes('APR'));
  const paperOffers92M1 = paper.offers.filter(o => o.grade === '92' && o.month?.includes('APR'));
  
  let swap92M1 = null;
  let swap92M1Source = '';
  
  if (paperTrades92M1.length > 0) {
    swap92M1 = paperTrades92M1.reduce((s, t) => s + t.price, 0) / paperTrades92M1.length;
    swap92M1Source = `${paperTrades92M1.length} trade(s)`;
  } else if (paperBids92M1.length > 0) {
    swap92M1 = Math.max(...paperBids92M1.map(b => b.price));
    swap92M1Source = 'highest bid (no trades)';
  }
  
  // Use indicative if no MOC data
  const swap92M1Final = swap92M1 ?? indicative.swaps['92_M1'];
  const swap92M1FinalSource = swap92M1Source || '3pm indicative';
  const swap92M2 = indicative.swaps['92_M2'];
  const swap92M3 = indicative.swaps['92_M3'];
  
  assessments['92RON'] = {
    physical: {
      price: physical92,
      source: physical92Source || 'no data',
      trades: cargoTrades92,
      bids: cargoBids92,
      offers: cargoOffers92
    },
    swap_M1: {
      price: swap92M1Final,
      source: swap92M1FinalSource,
      trades: paperTrades92M1,
      bids: paperBids92M1
    },
    swap_M2: { price: swap92M2, source: 'indicative' },
    swap_M3: { price: swap92M3, source: 'indicative' }
  };
  
  // === 95 RON ===
  const cargoTrades95 = cargo.trades.filter(t => t.grade === '95');
  const cargoBids95 = cargo.bids.filter(b => b.grade === '95');
  const cargoOffers95 = cargo.offers.filter(o => o.grade === '95');
  const paperTrades95 = paper.trades.filter(t => t.grade === '95');
  const paperBids95 = paper.bids.filter(b => b.grade === '95' && b.month?.includes('APR'));
  
  let physical95 = null, physical95Source = '';
  if (cargoTrades95.length > 0) {
    physical95 = cargoTrades95.reduce((s,t) => s+t.price, 0) / cargoTrades95.length;
    physical95Source = `${cargoTrades95.length} trade(s)`;
  } else if (cargoBids95.length > 0) {
    physical95 = Math.max(...cargoBids95.map(b => b.price));
    physical95Source = 'highest bid (no trades)';
  }
  
  assessments['95RON'] = {
    physical: {
      price: physical95,
      source: physical95Source || 'no data',
      trades: cargoTrades95,
      bids: cargoBids95
    },
    swap_M1: {
      price: paperTrades95.length > 0 ? paperTrades95.reduce((s,t)=>s+t.price,0)/paperTrades95.length : (paperBids95.length > 0 ? Math.max(...paperBids95.map(b=>b.price)) : null),
      source: paperTrades95.length > 0 ? `${paperTrades95.length} trade(s)` : 'bid/no data'
    }
  };
  
  // === 97 RON ===
  const cargoTrades97 = cargo.trades.filter(t => t.grade === '97');
  const cargoBids97 = cargo.bids.filter(b => b.grade === '97');
  const paperTrades97 = paper.trades.filter(t => t.grade === '97');
  const paperBids97 = paper.bids.filter(b => b.grade === '97' && b.month?.includes('APR'));
  
  let physical97 = null, physical97Source = '';
  if (cargoTrades97.length > 0) {
    physical97 = cargoTrades97.reduce((s,t) => s+t.price, 0) / cargoTrades97.length;
    physical97Source = `${cargoTrades97.length} trade(s)`;
  } else if (cargoBids97.length > 0) {
    physical97 = Math.max(...cargoBids97.map(b => b.price));
    physical97Source = 'highest bid (no trades)';
  }
  
  assessments['97RON'] = {
    physical: {
      price: physical97,
      source: physical97Source || 'no data',
      trades: cargoTrades97,
      bids: cargoBids97
    },
    swap_M1: {
      price: paperTrades97.length > 0 ? paperTrades97.reduce((s,t)=>s+t.price,0)/paperTrades97.length : (paperBids97.length > 0 ? Math.max(...paperBids97.map(b=>b.price)) : null),
      source: paperTrades97.length > 0 ? `${paperTrades97.length} trade(s)` : 'bid/no data'
    }
  };
  
  return assessments;
}

// Format strip prices
function formatStrip(assessments, updateMogas, indicative) {
  const m1 = assessments['92RON'].swap_M1.price;
  const m2 = assessments['92RON'].swap_M2.price;
  const m3 = assessments['92RON'].swap_M3.price;
  
  // Time spreads
  const m1m2 = m1 && m2 ? (m1 - m2).toFixed(2) : 'N/A';
  const m2m3 = m2 && m3 ? (m2 - m3).toFixed(2) : 'N/A';
  
  // Paper spread trades
  const balMar = updateMogas.swaps['sing_92RON_spread_Bal_Mar/Apr'] 
              ?? updateMogas.swaps['sing_92RON_spread_Bal Mar/Apr'];
  
  return {
    M1: m1 ? `$${m1.toFixed(2)}/bbl` : 'N/A',
    M2: m2 ? `$${m2.toFixed(2)}/bbl` : 'N/A',
    M3: m3 ? `$${m3.toFixed(2)}/bbl` : 'N/A',
    M1_M2: `$${m1m2}/bbl ${m1m2 > 0 ? '(backwardation)' : '(contango)'}`,
    M2_M3: `$${m2m3}/bbl ${m2m3 > 0 ? '(backwardation)' : '(contango)'}`,
    BalMar_Apr: balMar ? `$${balMar.toFixed(2)}/bbl` : 'N/A'
  };
}

// Build report
function buildReport(date, cargo, paper, indicative, updateMogas, fujData) {
  const assessments = calculateAssessment(cargo, paper, indicative, updateMogas, date);
  const strip = formatStrip(assessments, updateMogas, indicative);
  
  const a92 = assessments['92RON'];
  const a95 = assessments['95RON'];
  const a97 = assessments['97RON'];
  
  const crackDubaiM1 = indicative.cracks['Dubai_M1'];
  const crackBrentM1 = indicative.cracks['Brent_M1'];
  
  // Physical 95 vs 92 premium
  let prem9592 = (a95.physical.price && a92.physical.price) 
    ? (a95.physical.price - a92.physical.price).toFixed(2) 
    : 'N/A';
  let prem9792 = (a97.physical.price && a92.physical.price)
    ? (a97.physical.price - a92.physical.price).toFixed(2)
    : 'N/A';
  
  // Paper: 95 vs 92 swap
  let swapPrem9592 = (a95.swap_M1.price && a92.swap_M1.price)
    ? (a95.swap_M1.price - a92.swap_M1.price).toFixed(2)
    : 'N/A';
  
  let report = `🛢️ Singapore Mogas MOC Assessment — ${date}\n\n`;
  
  // === PHYSICAL CARGO ===
  report += `📦 PHYSICAL CARGO (FOB Straits, 15-30D)\n`;
  
  // 92 RON Physical
  report += `\n92 RON Physical:`;
  if (cargo.trades.filter(t=>t.grade==='92').length > 0) {
    cargo.trades.filter(t=>t.grade==='92').forEach(t => {
      report += `\n  ✅ TRADE: ${t.seller} → ${t.buyer} | ${t.laycan} | $${t.price.toFixed(2)}/bbl`;
    });
  } else {
    report += ` No trades`;
    if (a92.physical.price) {
      report += `\n  → Assessment: $${a92.physical.price.toFixed(2)}/bbl (${a92.physical.source})`;
      // Show top 3 bids
      const topBids = cargo.bids.filter(b=>b.grade==='92').slice(0,3);
      if (topBids.length) {
        report += `\n  Bids: ${topBids.map(b=>`${b.raw.match(/(\w+): BIDS/)?.[1]||'?'} $${b.price}`).join(' | ')}`;
      }
    }
  }
  
  // 95 RON Physical
  if (a95.physical.trades.length > 0 || a95.physical.bids.length > 0) {
    report += `\n\n95 RON Physical:`;
    if (a95.physical.trades.length > 0) {
      a95.physical.trades.forEach(t => {
        report += `\n  ✅ TRADE: ${t.seller} → ${t.buyer} | ${t.laycan} | $${t.price.toFixed(2)}/bbl`;
      });
    } else if (a95.physical.price) {
      report += `\n  → Assessment: $${a95.physical.price.toFixed(2)}/bbl (${a95.physical.source})`;
    }
    report += prem9592 !== 'N/A' ? `\n  95/92 premium: +$${prem9592}/bbl` : '';
  } else {
    report += `\n\n95 RON Physical: No bids/offers in window`;
  }
  
  // 97 RON Physical
  if (a97.physical.trades.length > 0 || a97.physical.bids.length > 0) {
    report += `\n\n97 RON Physical:`;
    if (a97.physical.trades.length > 0) {
      a97.physical.trades.forEach(t => {
        report += `\n  ✅ TRADE: ${t.seller} → ${t.buyer} | ${t.laycan} | $${t.price.toFixed(2)}/bbl`;
      });
    } else if (a97.physical.price) {
      report += `\n  → Assessment: $${a97.physical.price.toFixed(2)}/bbl (${a97.physical.source})`;
    }
  } else {
    report += `\n\n97 RON Physical: No bids/offers in window`;
  }
  
  // Fujairah
  if (fujData) {
    report += `\n\nFOB Fujairah: ${fujData}`;
  }
  
  // === PAPER/SWAP ===
  report += `\n\n📊 PAPER/SWAP (25KB lots)\n`;
  
  // 92 RON Swap
  report += `\n92 RON Apr Swap:`;
  if (paper.trades.filter(t=>t.grade==='92' && t.month?.includes('APR')).length > 0) {
    paper.trades.filter(t=>t.grade==='92' && t.month?.includes('APR')).forEach(t => {
      report += `\n  ✅ TRADE: ${t.seller} → ${t.buyer} | $${t.price.toFixed(2)}/bbl (${t.time||''})`;
    });
    report += `\n  → Assessment: $${a92.swap_M1.price?.toFixed(2)||'N/A'}/bbl (${a92.swap_M1.source})`;
  } else if (a92.swap_M1.bids.length > 0) {
    report += `\n  → Assessment: $${a92.swap_M1.price?.toFixed(2)||'N/A'}/bbl (${a92.swap_M1.source})`;
    report += `\n  No trades — based on best bid`;
  } else {
    report += ` $${a92.swap_M1.price?.toFixed(2)||'N/A'}/bbl (${a92.swap_M1.source})`;
  }
  
  // Paper spreads
  if (paper.spreadTrades.length > 0) {
    report += `\n\nSpread Trades:`;
    paper.spreadTrades.forEach(t => {
      report += `\n  ✅ ${t.month}: ${t.seller} → ${t.buyer} | $${t.price?.toFixed(2)||'?'}/bbl (${t.time||''})`;
    });
  }
  
  // === STRIP PRICES ===
  report += `\n\n📈 STRIP PRICES (92 RON Swap)\n`;
  report += `  M1 (Apr 2026): ${strip.M1}\n`;
  report += `  M2 (May 2026): ${strip.M2}\n`;
  report += `  M3 (Jun 2026): ${strip.M3}\n`;
  
  // === DAILY STRUCTURE ===
  report += `\n⚖️ DAILY STRUCTURE\n`;
  
  // Physical vs Swap
  if (a92.physical.price && a92.swap_M1.price) {
    const phys_swap = (a92.physical.price - a92.swap_M1.price).toFixed(2);
    report += `\n92 RON Phys/Swap: ${phys_swap > 0 ? '+' : ''}$${phys_swap}/bbl`;
  }
  
  // Time spreads
  report += `\nTime Spreads (92 RON):`;
  report += `\n  Bal Mar/Apr: ${strip.BalMar_Apr}`;
  report += `\n  Apr/May (M1/M2): $${strip.M1_M2}`;
  report += `\n  May/Jun (M2/M3): $${strip.M2_M3}`;
  
  // Crack spreads
  report += `\nCrack Spreads (92 RON, M1):`;
  if (crackDubaiM1) report += `\n  vs Dubai swap: +$${crackDubaiM1.toFixed(2)}/bbl`;
  if (crackBrentM1) report += `\n  vs ICE Brent: +$${crackBrentM1.toFixed(2)}/bbl`;
  
  // 95 vs 92 premium
  if (swapPrem9592 !== 'N/A') {
    report += `\n\n95 RON vs 92 RON swap: +$${swapPrem9592}/bbl`;
  }
  
  report += `\n\n📎 Source: Platts Heards API, ${date} MOC window`;
  
  return report;
}

async function main() {
  const token = loadToken();
  const date = new Date().toISOString().split('T')[0]; // e.g. 2026-03-12
  
  console.log(`\n🔍 Fetching Mogas MOC data for ${date}...\n`);
  
  // 1. Fetch all relevant heards
  const queries = [
    { q: 'PLATTS ASIA MOGAS CARGO MOC', type: 'cargo' },
    { q: 'PLATTS SINGAPORE GASOLINE PAPER', type: 'paper' },
    { q: 'PLATTS SINGAPORE GASOLINE MOC BIDS SUMMARY', type: 'summary' },
    { q: 'FOB Fujairah Gasoline Bids', type: 'fujairah' },
    { q: 'Indicative values effective 3.00pm', type: 'indicative' },
    { q: 'UPDATE PLATTS MOGAS', type: 'update' },
  ];
  
  const rawData = {};
  
  for (const { q, type } of queries) {
    try {
      console.log(`Fetching: ${q}`);
      const results = await searchHeards(q, token, 2);
      const todayResults = results.filter(r => r.updatedDate?.startsWith(date));
      
      console.log(`  Found ${todayResults.length} heards for ${date}`);
      
      const bodies = [];
      for (const item of todayResults) {
        const body = await fetchContent(item.id, token);
        bodies.push({ time: item.updatedDate, body: body.trim() });
      }
      rawData[type] = bodies;
    } catch (e) {
      console.error(`  Error fetching ${q}: ${e.message}`);
      rawData[type] = [];
    }
  }
  
  // 2. Parse raw data
  console.log('\n📊 Parsing MOC data...\n');
  
  // Find the most recent cargo/paper summaries
  const cargoBody = (rawData.cargo || []).sort((a,b) => b.time.localeCompare(a.time))[0]?.body || '';
  const paperBody = (rawData.paper || []).sort((a,b) => b.time.localeCompare(a.time))[0]?.body || '';
  const paperBidsBody = (rawData.paper || []).sort((a,b) => a.time.localeCompare(b.time))
    .find(b => b.body.includes('BIDS ON CLOSE'))?.body || '';
  
  // Combine paper bodies (trades + bids)
  const combinedPaperBody = (rawData.paper || []).map(b => b.body).join('\n\n');
  
  const indicativeBodies = (rawData.indicative || []).map(b => b.body);
  const updateBodies = (rawData.update || []).map(b => b.body);
  
  const cargo = parseCargoMOC(cargoBody);
  const paper = parsePaperMOC(combinedPaperBody);
  const indicative = parseIndicativeValues(indicativeBodies);
  const updateMogas = parseUpdateMogas(updateBodies);
  
  // Fujairah summary
  const fujBody = (rawData.fujairah || [])[0]?.body || '';
  const fujSummary = fujBody.includes('Bids:') ? fujBody.split('\n').slice(0,4).join('; ') : null;
  
  // Debug output
  console.log('Cargo parsed:', JSON.stringify({
    trades: cargo.trades.length,
    bids: cargo.bids.length,
    offers: cargo.offers.length
  }));
  console.log('Paper parsed:', JSON.stringify({
    trades: paper.trades.length,
    bids: paper.bids.length,
    spreadTrades: paper.spreadTrades.length
  }));
  console.log('Indicative swaps:', JSON.stringify(indicative.swaps));
  console.log('Indicative cracks:', JSON.stringify(indicative.cracks));
  console.log('Update MOGAS swaps:', JSON.stringify(updateMogas.swaps));
  
  // 3. Build report
  const report = buildReport(date, cargo, paper, indicative, updateMogas, fujSummary);
  
  console.log('\n' + '='.repeat(60));
  console.log(report);
  console.log('='.repeat(60));
  
  // 4. Also dump raw data for reference
  console.log('\n=== RAW CARGO DATA ===');
  console.log(cargoBody.substring(0, 2000));
  console.log('\n=== RAW PAPER DATA ===');
  console.log(combinedPaperBody.substring(0, 2000));
  
  return report;
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
