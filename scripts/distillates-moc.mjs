#!/usr/bin/env node
import { readFileSync } from 'fs';

const creds = JSON.parse(readFileSync('.config/spglobal/credentials.json', 'utf8'));
const token = creds.access_token;
const today = '2026-03-17';

// Same Phase 2 logic as Mogas
const dayOfMonth = 17;
const lastDayMarch = 31;
const isPhase2 = (dayOfMonth + 15) >= lastDayMarch;

console.log('=== Phase Detection ===');
console.log(`today = Mar ${dayOfMonth}, today+15 >= ${lastDayMarch}? ${isPhase2} → Phase ${isPhase2 ? 2 : 1}`);
console.log();

const m1Mid = 31 + 30/2; // April 15.0 = day 46
const m2Mid = 31 + 30 + 31/2; // May 15.5 = day 76.5
const daysBetween = m2Mid - m1Mid;
const midWindow = dayOfMonth + 22.5; // 39.5
const daysToMid = midWindow - m1Mid; // -6.5

async function queryEWindow(market, product) {
  const url = `https://api.platts.com/tradedata/v3/ewindowdata?` +
    `assessmentDate=${today}&market=${encodeURIComponent(market)}&product=${encodeURIComponent(product)}&pageSize=500`;
  
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  const data = await res.json();
  
  // Filter to this specific product (API sometimes returns all products)
  return (data.results || []).filter(r => r.product === product && r.market.includes(market));
}

async function analyzeProduct(productName, swapMarket, swapProduct, physMarket, physProduct) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${productName}`);
  console.log('='.repeat(60));
  
  // Fetch data
  const swapData = await queryEWindow(swapMarket, swapProduct);
  const swapBalData = await queryEWindow(swapMarket, swapProduct + ' (balmo)');
  const spreadData = await queryEWindow(swapMarket, swapProduct + ' Spr');
  const physData = await queryEWindow(physMarket, physProduct);
  
  console.log(`\nData fetched: ${swapData.length} swap, ${swapBalData.length} balmo, ${spreadData.length} spread, ${physData.length} physical`);
  
  // M1 VWAP
  const m1Trades = swapData.filter(r => 
    r.order_state === 'consummated' && 
    r.order_spread === 'F' &&
    r.strip === 'Apr26'
  );
  
  let m1Vwap = null;
  if (m1Trades.length > 0) {
    let totalQty = 0, totalValue = 0;
    m1Trades.forEach(t => {
      const qty = parseFloat(t.order_quantity) || 0;
      const price = parseFloat(t.price) || 0;
      totalQty += qty;
      totalValue += qty * price;
    });
    m1Vwap = totalQty > 0 ? (totalValue / totalQty).toFixed(2) : null;
    
    console.log(`\n[M1 Apr26 Swap]`);
    console.log(`${m1Trades.length} trades, VWAP: $${m1Vwap}/bbl`);
    m1Trades.slice(0,5).forEach(t => {
      const time = (t.order_time || '').slice(11,19);
      console.log(`  ${time} ${t.seller} → ${t.buyer} $${t.price} ${t.order_quantity}kb`);
    });
  } else {
    console.log(`\n[M1 Apr26 Swap] No trades`);
    
    // Show best close bid/offer
    const m1Bids = swapData.filter(r =>
      r.order_state === 'inactive' &&
      r.order_type === 'Bid' &&
      r.order_spread === 'F' &&
      r.strip === 'Apr26'
    ).sort((a,b) => parseFloat(b.price) - parseFloat(a.price));
    
    const m1Offers = swapData.filter(r =>
      r.order_state === 'inactive' &&
      r.order_type === 'Offer' &&
      r.order_spread === 'F' &&
      r.strip === 'Apr26'
    ).sort((a,b) => parseFloat(a.price) - parseFloat(b.price));
    
    if (m1Bids.length > 0 || m1Offers.length > 0) {
      const bestBid = m1Bids.length > 0 ? parseFloat(m1Bids[0].price) : null;
      const bestOffer = m1Offers.length > 0 ? parseFloat(m1Offers[0].price) : null;
      console.log(`Close: bid ${bestBid?.toFixed(2) || 'N/A'} / offer ${bestOffer?.toFixed(2) || 'N/A'}`);
      
      // Use mid-price if both exist
      if (bestBid && bestOffer) {
        m1Vwap = ((bestBid + bestOffer) / 2).toFixed(2);
        console.log(`→ Using mid-price as M1: $${m1Vwap}/bbl`);
      } else if (bestBid) {
        m1Vwap = bestBid.toFixed(2);
        console.log(`→ Using best bid as M1: $${m1Vwap}/bbl`);
      }
    }
  }
  
  // M1/M2 Spread
  const m1m2SpreadTrades = spreadData.filter(r =>
    r.order_state === 'consummated' &&
    r.order_spread === 'T' &&
    r.strip === 'Apr26/May26'
  );
  
  let m1m2SpreadVwap = null;
  if (m1m2SpreadTrades.length > 0) {
    let totalQty = 0, totalValue = 0;
    m1m2SpreadTrades.forEach(t => {
      const qty = parseFloat(t.order_quantity) || 0;
      const price = parseFloat(t.price) || 0;
      totalQty += qty;
      totalValue += qty * price;
    });
    m1m2SpreadVwap = totalQty > 0 ? (totalValue / totalQty).toFixed(2) : null;
    console.log(`\n[M1/M2 Spread] ${m1m2SpreadTrades.length} trades, VWAP: $${m1m2SpreadVwap}`);
  }
  
  // M1/M2 spread best bid
  const m1m2SpreadBids = spreadData.filter(r =>
    r.order_state === 'inactive' &&
    r.order_type === 'Bid' &&
    r.order_spread === 'T' &&
    r.strip === 'Apr26/May26'
  ).sort((a,b) => parseFloat(b.price) - parseFloat(a.price));
  
  const spreadBid = m1m2SpreadBids.length > 0 ? parseFloat(m1m2SpreadBids[0].price) : null;
  
  // M2 abs best bid
  const m2Bids = swapData.filter(r =>
    r.order_state === 'inactive' &&
    r.order_type === 'Bid' &&
    r.order_spread === 'F' &&
    r.strip === 'May26'
  ).sort((a,b) => parseFloat(b.price) - parseFloat(a.price));
  
  const m2Bid = m2Bids.length > 0 ? parseFloat(m2Bids[0].price) : null;
  
  console.log(`\n[Spread Analysis]`);
  console.log(`M1/M2 spread VWAP: ${m1m2SpreadVwap || 'N/A'}`);
  console.log(`M1/M2 spread best bid: ${spreadBid?.toFixed(2) || 'N/A'}`);
  console.log(`M2 abs best bid: ${m2Bid?.toFixed(2) || 'N/A'}`);
  
  // Choose spread
  let spread = null;
  if (m1m2SpreadVwap) {
    spread = parseFloat(m1m2SpreadVwap);
    console.log(`→ Using M1/M2 spread VWAP: $${spread}`);
  } else if (m1Vwap && m2Bid) {
    const impliedSpread = parseFloat(m1Vwap) - m2Bid;
    spread = Math.max(spreadBid || 0, impliedSpread);
    console.log(`→ Using max(spreadBid ${spreadBid?.toFixed(2) || 'N/A'}, impliedSpread ${impliedSpread.toFixed(2)}) = $${spread.toFixed(2)}`);
  } else if (m1Vwap && spreadBid) {
    spread = spreadBid;
    console.log(`→ Using spread best bid: $${spread.toFixed(2)}`);
  }
  
  if (!m1Vwap || !spread) {
    console.log(`\n⚠️ Cannot calculate MOPS Strip - missing M1 VWAP (${m1Vwap || 'N/A'}) or spread (${spread || 'N/A'})`);
    return;
  }
  
  // Calculate Strip
  const ds = spread / daysBetween;
  const strip = parseFloat(m1Vwap) - ds * daysToMid;
  
  console.log(`\n[MOPS Strip Calculation]`);
  console.log(`DS = $${spread.toFixed(2)} / ${daysBetween} = $${ds.toFixed(4)}/bbl/day`);
  console.log(`Strip = M1($${m1Vwap}) - DS($${ds.toFixed(4)}) × daysToMid(${daysToMid}) = $${strip.toFixed(2)}/bbl`);
  
  // Physical
  const physTrades = physData.filter(r =>
    r.order_state === 'consummated' &&
    r.price >= 100 // absolute price
  );
  
  console.log(`\n[Physical Cargo]`);
  if (physTrades.length > 0) {
    console.log(`${physTrades.length} trades:`);
    physTrades.slice(0,5).forEach(t => {
      const time = (t.order_time || '').slice(11,19);
      console.log(`  ${time} ${t.seller} → ${t.buyer} $${t.price} ${t.strip}`);
    });
  } else {
    console.log(`No absolute price trades`);
    
    // Show top bids
    const bids = physData.filter(r =>
      r.order_state === 'inactive' &&
      r.order_type === 'Bid' &&
      r.price >= 100
    ).sort((a,b) => parseFloat(b.price) - parseFloat(a.price));
    
    if (bids.length > 0) {
      console.log(`Top demonstrable bids:`);
      bids.slice(0,3).forEach(b => {
        console.log(`  ${b.market_maker} $${b.price} ${b.strip}`);
      });
    }
  }
}

async function main() {
  await analyzeProduct(
    'Gasoil 10ppm', 
    'ASIA MidDist Swap', 'Platts GO',
    'ASIA MD (PVO)', 'Platts GO 10ppm'
  );
  
  await analyzeProduct(
    'Singapore Jet/Kerosene',
    'ASIA MidDist Swap', 'Platts Jet',
    'ASIA MD (PVO)', 'Platts Jet'
  );
}

main().catch(e => console.error('Error:', e.message));
