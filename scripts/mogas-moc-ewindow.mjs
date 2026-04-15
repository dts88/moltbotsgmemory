#!/usr/bin/env node
/**
 * Singapore Mogas MOC Analysis — eWindow API v3
 * Base: https://api.platts.com/tradedata/v3/ewindowdata
 */

import { readFileSync } from 'fs';

const BASE = 'https://api.platts.com/tradedata/v3';
const APPKEY = 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN';

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Get M1/M2/M3 strip labels from date string (e.g. "2026-03-12") */
function getStripLabels(date) {
  const d = new Date(date);
  const m = d.getMonth(); // 0-based
  const y = d.getFullYear() % 100;
  const yy = y.toString().padStart(2, '0');
  return {
    balMonth: 'Bal Month',
    balM1Spr: `Bal Month/${MON[(m + 1) % 12]}${yy}`,
    m1: `${MON[(m + 1) % 12]}${yy}`,
    m2: `${MON[(m + 2) % 12]}${m + 2 > 11 ? (y + 1).toString().padStart(2,'0') : yy}`,
    m3: `${MON[(m + 3) % 12]}${m + 3 > 11 ? (y + 1).toString().padStart(2,'0') : yy}`,
    m1m2Spr: `${MON[(m + 1) % 12]}${yy}/${MON[(m + 2) % 12]}${m + 2 > 11 ? (y + 1).toString().padStart(2,'0') : yy}`,
    m2m3Spr: `${MON[(m + 2) % 12]}${m + 2 > 11 ? (y + 1).toString().padStart(2,'0') : yy}/${MON[(m + 3) % 12]}${m + 3 > 11 ? (y + 1).toString().padStart(2,'0') : yy}`,
  };
}

/**
 * Parse laycan string (e.g. "Apr10-Apr14", "Mar31-Apr4") to mid-day in
 * "days of current month" units, allowing overflow into next/next-next month.
 * Returns null if unable to parse.
 *
 * Example (today = Mar 16):
 *   "Mar31-Apr4"  → (31 + 35) / 2 = 33.0
 *   "Apr10-Apr14" → (41 + 45) / 2 = 43.0
 *   "Apr5-Apr9"   → (36 + 40) / 2 = 38.0
 */
function parseLaycanMid(laycanStr, todayDate) {
  const MON_NUM = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
  const parts = laycanStr?.split('-');
  if (!parts || parts.length !== 2) return null;
  const parseP = s => { const m = s.trim().match(/^([A-Za-z]+)(\d+)$/); return m ? {mon:MON_NUM[m[1]],day:parseInt(m[2])} : null; };
  const s = parseP(parts[0]);
  const e = parseP(parts[1]);
  if (!s || !e || !s.mon || !e.mon) return null;

  const d   = new Date(todayDate);
  const curMon  = d.getMonth() + 1; // 1-based
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const lastDayM1 = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();

  const toDayNum = (mon, day) => {
    if (mon === curMon) return day;
    const m1 = curMon === 12 ? 1 : curMon + 1;
    const m2 = m1   === 12 ? 1 : m1   + 1;
    if (mon === m1) return lastDay + day;
    if (mon === m2) return lastDay + lastDayM1 + day;
    return null; // out of range
  };

  const sd = toDayNum(s.mon, s.day);
  const ed = toDayNum(e.mon, e.day);
  if (sd == null || ed == null) return null;
  return (sd + ed) / 2;
}

/**
 * Determine which phase (Bal/M1 vs M1/M2) to use for MOPS Strip calculation.
 *
 * Phase switch rule (confirmed 2026-03-16):
 *   today + 15 >= last_day_of_month  →  Phase 2: M1/M2
 *   today + 15 <  last_day_of_month  →  Phase 1: Bal/M1
 *
 * Rationale: when the loading window start (today+15) reaches the last day of
 * the current month, Bal Month swap is essentially expired — Platts stops
 * publishing AAXEK00 and switches to M1/M2 as the relevant spread pair.
 */
function getStripPhase(date) {
  const d = new Date(date);
  const today = d.getDate();
  const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return (today + 15) >= lastDayOfMonth ? 'M1/M2' : 'Bal/M1';
}

/**
 * Calculate MOPS Strip (AAXEQ00) using Platts methodology.
 *
 * Phase 1 (Bal/M1):  Strip = BalMonth - DS × daysToMid
 *   frontMonth = Bal Month swap,  spread = Bal/M1 spread
 *   mid_earlier = mid of Bal Month (current month),  mid_later = mid of M1
 *   daysToMid > 0  (loading window mid is after Bal Month mid → Strip < Bal Month)
 *
 * Phase 2 (M1/M2):  Strip = M1 - DS × daysToMid
 *   frontMonth = M1 swap,  spread = M1/M2 spread
 *   mid_earlier = mid of M1 (next month),  mid_later = mid of M2
 *   daysToMid < 0  (loading window mid is BEFORE M1 mid → Strip > M1)
 */
function calcMopsStrip(date, frontMonthPrice, spreadAvg, phase) {
  const d = new Date(date);
  const today = d.getDate();
  const lastDayOfMonth  = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const daysInM1        = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
  const daysInM2        = new Date(d.getFullYear(), d.getMonth() + 3, 0).getDate();

  let midEarlier, midLater;
  if (phase === 'Bal/M1') {
    // mid of Bal Month (current month)  →  mid of M1 (next month)
    // Platts mid formula: days_in_month / 2  (e.g. April=15, May=15.5)
    midEarlier = Math.floor((today + lastDayOfMonth) / 2);  // Bal Month mid stays floored (per KDC)
    midLater   = lastDayOfMonth + daysInM1 / 2;             // M1 mid = daysInM1 / 2
  } else {
    // mid of M1 (next month)  →  mid of M2 (month after next)
    midEarlier = lastDayOfMonth + daysInM1 / 2;             // M1 mid
    midLater   = lastDayOfMonth + daysInM1 + daysInM2 / 2;  // M2 mid
  }

  const daysBetween     = midLater - midEarlier;
  const dailyStructure  = parseFloat(spreadAvg) / daysBetween;
  const midWindow       = (today + 15 + today + 30) / 2;  // today + 22.5
  const daysToMid       = midWindow - midEarlier;
  const mopsStrip       = parseFloat(frontMonthPrice) - dailyStructure * daysToMid;

  return {
    phase,
    frontMonthPrice: parseFloat(frontMonthPrice),
    spread: parseFloat(spreadAvg),
    daysBetween,
    dailyStructure: parseFloat(dailyStructure.toFixed(4)),
    midEarlier,
    midWindow,
    daysToMid: parseFloat(daysToMid.toFixed(1)),
    mopsStrip: parseFloat(mopsStrip.toFixed(2)),
  };
}

function getToken() {
  const config = JSON.parse(readFileSync('/home/node/clawd/.config/spglobal/credentials.json', 'utf8'));
  return config.access_token;
}

async function ewFetch(path) {
  const token = getToken();
  const r = await fetch(BASE + path, {
    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
  });
  if (!r.ok) throw new Error(`eWindow API ${r.status}: ${await r.text()}`);
  return r.json();
}

async function getConsummated(market, date) {
  const filter = `market="${market}" AND order_date="${date}" AND order_state="consummated"`;
  const url = `/ewindowdata?filter=${encodeURIComponent(filter)}&sort=order_time:asc&pageSize=1000`;
  const d = await ewFetch(url);
  return d.results || [];
}

async function getOrderBook(market, date) {
  // Include withdrawn so we capture orders that were active at close (08:30:00)
  // but withdrawn shortly after (e.g. Shenghong Apr/May bid $12.55 withdrawn 08:30:34)
  const filter = `market="${market}" AND order_date="${date}" AND order_state in ("inactive","active","withdrawn")`;
  const url = `/ewindowdata?filter=${encodeURIComponent(filter)}&sort=order_time:desc&pageSize=1000`;
  const d = await ewFetch(url);
  const results = d.results || [];

  // For "withdrawn" records: eWindow overwrites order_time with withdrawal time.
  // So we cannot use order_time < 08:30:00 to detect "was active at close".
  // Instead: include withdrawn records whose update_time is within 5 min after close
  // (08:30:00 ~ 08:35:00) — these were almost certainly active at window close.
  const CLOSE_TIME   = `${date}T08:30:00`;
  const CUTOFF_TIME  = `${date}T08:35:00`;
  return results.filter(r => {
    if (r.order_state === 'inactive' || r.order_state === 'active') return true;
    if (r.order_state === 'withdrawn') {
      const t = r.update_time || '';
      return t >= CLOSE_TIME && t <= CUTOFF_TIME;
    }
    return false;
  });
}

function vwap(trades) {
  if (!trades.length) return null;
  const totalVol = trades.reduce((s, t) => s + (t.deal_quantity || t.order_quantity || 0), 0);
  const totalVal = trades.reduce((s, t) => s + t.price * (t.deal_quantity || t.order_quantity || 0), 0);
  return totalVol > 0 ? (totalVal / totalVol).toFixed(2) : null;
}

function avg(arr) {
  return arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2) : null;
}

/**
 * Fetch Platts Singapore Gasoline Key Data Commentary (KDC) for the given date.
 * KDC is the authoritative source for Bal Month price, Daily Structure, and MOPS Strip.
 * Published ~09:30-09:40 UTC each trading day.
 */
async function fetchKDC(date) {
  const token = getToken();
  // Search for KDC article on the given date (updatedDate range)
  const nextDay = new Date(new Date(date).getTime() + 86400000).toISOString().split('T')[0];
  const url = `https://api.platts.com/news-insights/v1/search/story?q=singapore+gasoline+daily+structure&pageSize=10`;
  const r = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token, 'appkey': APPKEY }
  });
  if (!r.ok) return null;
  const d = await r.json();
  // Find article updated on the target date
  const items = d.results || [];
  const item = items.find(x => x.updatedDate?.startsWith(date));
  if (!item) return null;

  // Fetch full content
  const cr = await fetch(`https://api.platts.com/news-insights/v1/content/${item.id}`, {
    headers: { 'Authorization': 'Bearer ' + token, 'appkey': APPKEY }
  });
  if (!cr.ok) return null;
  const cd = await cr.json();
  const body = cd.envelope?.content?.body || '';

  // Parse KDC data from HTML body
  const result = { raw: body, id: item.id, publishedDate: item.updatedDate };
  // Bal Month price: "92 RON swap: March at $129.60/b"
  const balMatch = body.match(/92 RON swap:\s*\w+ at \$([\d.]+)\/b/i);
  if (balMatch) result.balMonthPrice = parseFloat(balMatch[1]);
  // Bal/M1 spread: "March/April at $12.00/b"
  const sprMatch = body.match(/92 RON swap:\s*\w+\/\w+ at \$([\d.]+)\/b/i);
  if (sprMatch) result.balM1Spread = parseFloat(sprMatch[1]);
  // Daily Structure: "daily structure of 48 cents/b"
  const dsMatch = body.match(/daily structure of ([\d.]+) cents\/b/i);
  if (dsMatch) result.dailyStructure = parseFloat(dsMatch[1]) / 100;
  // MOPS Strip: "MOPS_Strip is ... = $123.12/b"
  const stripMatch = body.match(/MOPS_?Strip is .+?= \$([\d.]+)\/b/i);
  if (stripMatch) result.mopsStrip = parseFloat(stripMatch[1]);
  // Days between
  const daysMatch = body.match(/days between .+ is (\d+)/i);
  if (daysMatch) result.daysBetween = parseInt(daysMatch[1]);
  // daysToMid
  const dtmMatch = body.match(/(-[\d.]+) days between mid-\w+ and mid-window/i);
  if (dtmMatch) result.daysToMid = Math.abs(parseFloat(dtmMatch[1]));

  return result;
}

export async function analyzeMogasMOC(date) {
  const lbl = getStripLabels(date);

  const [physConsum, swapConsum, swapBook, physBook, kdc] = await Promise.all([
    getConsummated('ASIA Mogas Physical', date),
    getConsummated('ASIA Mogas Swap', date),
    getOrderBook('ASIA Mogas Swap', date),
    getOrderBook('ASIA Mogas Physical', date),
    fetchKDC(date),
  ]);

  // ── Physical Cargo ──
  // Note: prices < $100 are MOPS differential-priced trades, not absolute price → excluded from assessment
  const phys92All = physConsum.filter(r => r.product?.includes('92') && !r.product?.includes('Spr'));
  const phys92Trades = phys92All.filter(r => r.price >= 100);   // absolute-priced only
  const phys92DiffTrades = phys92All.filter(r => r.price < 100); // differential-priced (informational)
  const phys95All = physConsum.filter(r => r.product?.includes('95'));
  const phys95Trades = phys95All.filter(r => r.price >= 5);  // filter out near-zero differential records

  // All physical 92 RON bids (absolute price only, descending)
  const phys92Bids = physBook
    .filter(r => r.order_type === 'Bid' && r.product?.includes('92') && !r.product?.includes('Spr') && r.price > 100)
    .sort((a, b) => b.price - a.price);
  // Categorise by timing (per Platts: close > near-close > earlier active)
  // - Close (inactive): standing at 08:30 UTC window close — highest certainty
  // - Near-close active: submitted ≥08:29 UTC and still active — Platts considers these demonstrable
  //   (e.g. VITOLSG $130.10 at 08:29:58 on 3/12 was used by Platts)
  // - Earlier active: submitted before 08:29 — lower certainty, may be withdrawn before close
  const phys92CloseBids      = phys92Bids.filter(r => r.order_state === 'inactive');
  const phys92NearCloseBids  = phys92Bids.filter(r => r.order_state === 'active' &&
                                   r.order_time?.substring(11, 16) >= '08:29');
  const phys92EarlierBids    = phys92Bids.filter(r => r.order_state === 'active' &&
                                   r.order_time?.substring(11, 16) < '08:29');

  const phys95Bids = physBook
    .filter(r => r.order_type === 'Bid' && r.product?.includes('95'))
    .sort((a, b) => b.price - a.price);

  // ── Swap / Paper ──
  // Each spread trade creates 3 records: spread + 2 derived outright legs
  // For VWAP we ONLY use order_spread="F" (direct outrights)
  const swapBalMonth = swapConsum.filter(r =>
    r.product === 'Platts Mogas 92 (balmo)' && r.strip === lbl.balMonth && r.order_spread === 'F'
  );
  const swapM1 = swapConsum.filter(r =>
    r.product === 'Platts Mogas 92' && r.strip === lbl.m1 && r.order_spread === 'F'
  );
  const swapM2 = swapConsum.filter(r =>
    r.product === 'Platts Mogas 92' && r.strip === lbl.m2 && r.order_spread === 'F'
  );
  const swapM3 = swapConsum.filter(r =>
    r.product === 'Platts Mogas 92' && r.strip === lbl.m3 && r.order_spread === 'F'
  );
  const spreadBalM1 = swapConsum.filter(r => r.order_spread === 'T' && r.strip === lbl.balM1Spr);
  const spreadM1M2 = swapConsum.filter(r => r.order_spread === 'T' && r.strip === lbl.m1m2Spr);
  const spreadM2M3 = swapConsum.filter(r => r.order_spread === 'T' && r.strip === lbl.m2m3Spr);

  // ── M1 Orderbook at close (inactive) ──
  const swapM1CloseBids = swapBook
    .filter(r => r.order_state === 'inactive' && r.order_type === 'Bid' &&
                 r.product === 'Platts Mogas 92' && r.strip === lbl.m1 && r.order_spread === 'F')
    .sort((a, b) => b.price - a.price);
  const swapM1CloseOffers = swapBook
    .filter(r => r.order_state === 'inactive' && r.order_type === 'Offer' &&
                 r.product === 'Platts Mogas 92' && r.strip === lbl.m1 && r.order_spread === 'F')
    .sort((a, b) => a.price - b.price);
  // Also keep all M1 bids/offers for display
  const swapM1Bids = swapBook
    .filter(r => r.order_type === 'Bid' && r.product === 'Platts Mogas 92' && r.strip === lbl.m1)
    .sort((a, b) => b.price - a.price);
  const swapM1Offers = swapBook
    .filter(r => r.order_type === 'Offer' && r.product === 'Platts Mogas 92' && r.strip === lbl.m1)
    .sort((a, b) => a.price - b.price);

  // ── Bal/M1 spread at close (inactive preferred, then active) ──
  const balM1SprCloseBids = swapBook
    .filter(r => r.order_state === 'inactive' && r.order_type === 'Bid' &&
                 r.strip === lbl.balM1Spr && r.order_spread === 'T')
    .sort((a, b) => b.price - a.price);
  const balM1SprCloseOffers = swapBook
    .filter(r => r.order_state === 'inactive' && r.order_type === 'Offer' &&
                 r.strip === lbl.balM1Spr && r.order_spread === 'T' && r.price < 20)
    .sort((a, b) => a.price - b.price);
  const balM1SprActiveBids = swapBook
    .filter(r => r.order_state === 'active' && r.order_type === 'Bid' &&
                 r.strip === lbl.balM1Spr && r.order_spread === 'T')
    .sort((a, b) => b.price - a.price);

  // ── Bal Month absolute bids from active orderbook (inactive ones are all differential) ──
  const swapBalAbsBids = swapBook
    .filter(r => r.order_type === 'Bid' && r.product === 'Platts Mogas 92 (balmo)' &&
                 r.strip === lbl.balMonth && r.price > 100)
    .sort((a, b) => b.price - a.price);

  // ─────────────────────────────────────────────────────────────────
  // ── M1 Assessment (PRFEY00) — priority: trades → close mid → bid
  // ─────────────────────────────────────────────────────────────────
  const m1Vwap = vwap(swapM1);
  const m1CloseBestBid   = swapM1CloseBids[0]?.price;
  const m1ClosebestOffer = swapM1CloseOffers[0]?.price;
  const m1CloseMid = (m1CloseBestBid && m1ClosebestOffer)
    ? parseFloat(((m1CloseBestBid + m1ClosebestOffer) / 2).toFixed(2)) : null;

  let m1Assessment, m1AssessmentSource;
  if (m1Vwap) {
    m1Assessment = m1Vwap; m1AssessmentSource = `VWAP ${swapM1.length}trades`;
  } else if (m1CloseMid) {
    m1Assessment = m1CloseMid.toFixed(2); m1AssessmentSource = `close mid ${m1CloseBestBid}/${m1ClosebestOffer}`;
  } else if (m1CloseBestBid) {
    m1Assessment = m1CloseBestBid.toFixed(2); m1AssessmentSource = `close best bid`;
  } else {
    m1Assessment = null; m1AssessmentSource = 'no data';
  }

  // Spreads (consummated trades VWAP)
  const balM1SprAvg = avg(spreadBalM1.map(r => r.price));
  const m1m2SprAvg = avg(spreadM1M2.map(r => r.price));
  const m2m3SprAvg = avg(spreadM2M3.map(r => r.price));

  // ─────────────────────────────────────────────────────────────────
  // ── MOPS Strip (AAXEQ00) — eWindow methodology priority chain ──
  //
  // Phase 1 (Bal/M1): today+15 < lastDayOfMonth
  //   frontMonth = Bal Month swap price  (derived from M1 + Bal/M1 spread)
  //   spread     = Bal/M1 spread
  //   Strip < frontMonth  (loading window is after Bal Month mid)
  //
  // Phase 2 (M1/M2): today+15 >= lastDayOfMonth  ← switched to >= (confirmed 2026-03-16)
  //   frontMonth = M1 (Apr) swap price
  //   spread     = M1/M2 spread
  //   Strip > frontMonth  (loading window is before M1 mid, daysToMid < 0)
  //
  // KDC is NOT used as primary source. KDC is for post-hoc calibration only.
  // ─────────────────────────────────────────────────────────────────
  const stripPhase = getStripPhase(date);
  const isM1M2Phase = stripPhase === 'M1/M2';

  const balMonthTradeVwap = vwap(swapBalMonth);
  const m2Vwap = vwap(swapM2);

  let mopsStripData = null;
  let frontMonthUsed, spreadUsed, stripSource;

  if (!isM1M2Phase) {
    // ── Phase 1: Bal/M1 ──────────────────────────────────────────
    if (balMonthTradeVwap && balM1SprAvg) {
      // ① Bal Month outright + Bal/M1 spread both traded
      frontMonthUsed = parseFloat(balMonthTradeVwap);
      spreadUsed = parseFloat(balM1SprAvg);
      stripSource = `[Bal/M1] Bal Month VWAP + spread VWAP`;
    } else if (m1Assessment && balM1SprAvg) {
      // ② Bal/M1 spread traded → derive Bal Month = M1 + spread
      spreadUsed = parseFloat(balM1SprAvg);
      frontMonthUsed = parseFloat(m1Assessment) + spreadUsed;
      stripSource = `[Bal/M1] M1 [${m1AssessmentSource}] + spread VWAP ${balM1SprAvg}`;
    } else if (m1Assessment) {
      // ③ No spread trades → max(spread close bid, implied from Bal Month abs bid)
      const spreadBid = balM1SprCloseBids[0]?.price || balM1SprActiveBids[0]?.price;
      const balAbsBid = swapBalAbsBids[0]?.price;
      const impliedSpr = balAbsBid ? balAbsBid - parseFloat(m1Assessment) : null;
      if (spreadBid || impliedSpr) {
        const candidates = [spreadBid, impliedSpr > 0 ? impliedSpr : null].filter(Boolean);
        spreadUsed = parseFloat(Math.max(...candidates).toFixed(2));
        frontMonthUsed = parseFloat(m1Assessment) + spreadUsed;
        const parts = [];
        if (spreadBid) parts.push(`spread best bid ${spreadBid}`);
        if (impliedSpr > 0) parts.push(`Bal Month abs bid ${balAbsBid} (implied spr ${impliedSpr.toFixed(2)})`);
        stripSource = `[Bal/M1] M1 [${m1AssessmentSource}] + max(${parts.join(', ')})`;
      }
    }
  } else {
    // ── Phase 2: M1/M2 ──────────────────────────────────────────
    // frontMonth = M1 assessment (Apr swap)
    // spread     = M1/M2 spread
    if (m1Assessment && m1m2SprAvg) {
      // ① M1/M2 spread traded
      frontMonthUsed = parseFloat(m1Assessment);
      spreadUsed = parseFloat(m1m2SprAvg);
      stripSource = `[M1/M2] M1 [${m1AssessmentSource}] + M1/M2 spread VWAP ${m1m2SprAvg}`;
    } else if (m1Assessment) {
      // ② No M1/M2 spread trades → use M1/M2 spread close bid
      // Also check: implied spread from M2 close bid
      const m1m2SprCloseBids = swapBook
        .filter(r => (r.order_state === 'inactive' || r.order_state === 'withdrawn') && r.order_type === 'Bid' &&
                     r.strip === lbl.m1m2Spr && r.order_spread === 'T')
        .sort((a, b) => b.price - a.price);
      const m1m2SprActiveBids = swapBook
        .filter(r => r.order_state === 'active' && r.order_type === 'Bid' &&
                     r.strip === lbl.m1m2Spr && r.order_spread === 'T')
        .sort((a, b) => b.price - a.price);
      const swapM2AbsBids = swapBook
        .filter(r => r.order_type === 'Bid' && r.product === 'Platts Mogas 92' &&
                     r.strip === lbl.m2 && r.price > 100 && r.order_spread === 'F')
        .sort((a, b) => b.price - a.price);

      const spreadBid = m1m2SprCloseBids[0]?.price || m1m2SprActiveBids[0]?.price;
      const m2AbsBid = swapM2AbsBids[0]?.price;
      const impliedSpr = m2AbsBid ? parseFloat(m1Assessment) - m2AbsBid : null;

      frontMonthUsed = parseFloat(m1Assessment);
      if (spreadBid || impliedSpr) {
        const candidates = [spreadBid, impliedSpr > 0 ? impliedSpr : null].filter(Boolean);
        spreadUsed = parseFloat(Math.max(...candidates).toFixed(2));
        const parts = [];
        if (spreadBid) parts.push(`M1/M2 spread best bid ${spreadBid}`);
        if (impliedSpr > 0) parts.push(`M2 abs bid ${m2AbsBid} (implied spr ${impliedSpr.toFixed(2)})`);
        stripSource = `[M1/M2] M1 [${m1AssessmentSource}] + max(${parts.join(', ')})`;
      } else {
        // No spread data at all — strip cannot be computed
        stripSource = `[M1/M2] M1 [${m1AssessmentSource}] — no M1/M2 spread data`;
      }
    }
  }

  if (frontMonthUsed != null && spreadUsed != null) {
    mopsStripData = {
      source: stripSource,
      isEstimate: isM1M2Phase ? !m1m2SprAvg : !balM1SprAvg,
      ...calcMopsStrip(date, frontMonthUsed, spreadUsed, stripPhase),
    };
  }

  // ── KDC comparison (post-hoc only) ──
  const kdcCheck = kdc?.mopsStrip ? {
    strip: kdc.mopsStrip,
    balMonth: kdc.balMonthPrice,
    spread: kdc.balM1Spread,
    gap: mopsStripData ? parseFloat((kdc.mopsStrip - mopsStripData.mopsStrip).toFixed(2)) : null,
  } : null;

  // Derive M2/M3 from M1 VWAP + spreads
  const m1 = parseFloat(m1Assessment);
  const m2 = m1m2SprAvg ? (m1 - parseFloat(m1m2SprAvg)).toFixed(2) : null;
  const m3 = m2 && m2m3SprAvg ? (parseFloat(m2) - parseFloat(m2m3SprAvg)).toFixed(2) : null;

  // ─────────────────────────────────────────────────────────────────
  // ── Physical Premium Assessment (Platts-aligned methodology) ────
  //
  // Platts "demonstrable bid" rule (from Rationales & Exclusions):
  //   A physical bid is demonstrable only if it shows INDEPENDENT price discovery,
  //   i.e., it is meaningfully ABOVE the swap-derived Bal Month (= M1 + Bal/M1 spread).
  //   A bid at swap parity adds no new information and is NOT adopted by Platts —
  //   they fall back to "notional physical cash differential" (editorial, not computable from eWindow).
  //
  //   Example: 3/11 GUNVORSG $114.80 = M1 $106.10 + spread $8.70 = swap parity → NOT demonstrable
  //   Example: 3/12 VITOLSG $130.10 = swap Bal Month $127.60 + $2.50 premium → demonstrable ✅
  //
  // Bid timing preference: close (inactive) → near-close active (≥08:29) → earlier active
  // ─────────────────────────────────────────────────────────────────
  // ── Physical Demonstrability Constants ──
  // Platts "demonstrable bid": a physical bid is only valid for assessment if it shows
  // INDEPENDENT price discovery, meaning it is STRICTLY ABOVE the swap-derived Bal Month.
  //   > +PARITY_TOL vs swapBal → demonstrable (genuine physical demand above swap)
  //   within ±PARITY_TOL     → swap_parity   (mirrors swap, no new info → Platts uses notional)
  //   < -PARITY_TOL          → below_parity  (cheap bid, not reflective of market → Platts uses notional)
  // Validation: 3/11 TRAFI $112 (-$2.59 vs swapBal $114.59) → below_parity ✅
  //             3/11 GUNVORSG $114.80 (0 vs swapBal using last M1 $106.10+$8.70=$114.80) → swap_parity ✅
  //             3/12 VITOLSG $130.10 (+$2.50 vs swapBal $127.60) → demonstrable ✅
  const PARITY_TOL = 0.30;  // $/bbl tolerance
  const mopsStrip  = mopsStripData?.mopsStrip;
  // swapBal = the "Bal Month equivalent" used for demonstrability classification
  // Phase 1: frontMonthUsed = Bal Month;  Phase 2: frontMonthUsed = M1 (which IS the front month)
  const swapBal    = frontMonthUsed;

  // Also compute Bal Month using BEST (highest) M1 consummated price
  // Physical bidders reference the BEST recent swap price, not VWAP
  const m1BestTrade = swapM1.length > 0 ? Math.max(...swapM1.map(r => r.price)) : null;
  const swapBalBest = (m1BestTrade && spreadUsed) ? parseFloat((m1BestTrade + (isM1M2Phase ? 0 : spreadUsed)).toFixed(2)) : swapBal;

  // Classify a bid relative to swap Bal Month references
  function classifyBid(bidPrice) {
    const ref = swapBalBest ?? swapBal;
    if (ref == null) return { class: 'unknown', diff: null };
    const diff = parseFloat((bidPrice - ref).toFixed(2));
    if (diff > PARITY_TOL)          return { class: 'above_parity', diff };
    if (diff >= -PARITY_TOL)        return { class: 'swap_parity',  diff };
    return                                 { class: 'below_parity', diff };
  }

  // Find the best DEMONSTRABLE bid (strictly above swap Bal Month)
  // Search order: close → near-close → earlier active
  const allPhys92Ranked = [
    ...phys92CloseBids.map(b => ({ ...b, category: 'close' })),
    ...phys92NearCloseBids.map(b => ({ ...b, category: 'near-close' })),
    ...phys92EarlierBids.map(b => ({ ...b, category: 'earlier-active' })),
  ];
  const bestDemonstrableBid = allPhys92Ranked.find(b => classifyBid(b.price).class === 'above_parity');
  const bestAnyBid          = allPhys92Ranked[0];  // highest price regardless of demonstrability

  let physPremium92 = null;
  let physPremiumStatus = 'no_bid';   // traded | demonstrable | swap_parity | below_parity | no_bid
  let physAssessmentDetail = null;    // { price, normalizedPrice, timeAdj, laycanMid, source }

  // ── Time-adjustment helper ───────────────────────────────────────────────
  // Normalize any physical price to the reference mid_window using Daily Structure.
  // In backwardation: earlier loading = higher value → positive adjustment
  //   timeAdj   = -DS × (laycanMid - midWindow)
  //   normalized = price + timeAdj  =  price - DS × (laycanMid - midWindow)
  const ds       = mopsStripData?.dailyStructure ?? 0;
  const midWin   = mopsStripData?.midWindow ?? null;

  function timeAdjust(price, laycanStr) {
    if (!midWin || !ds || !laycanStr) return { normalized: price, timeAdj: 0, laycanMid: null };
    const laycanMid = parseLaycanMid(laycanStr, date);
    if (laycanMid == null) return { normalized: price, timeAdj: 0, laycanMid: null };
    const timeAdj = parseFloat((-ds * (laycanMid - midWin)).toFixed(2));
    return { normalized: parseFloat((price + timeAdj).toFixed(2)), timeAdj, laycanMid };
  }

  // Build candidate list: all trades + all demonstrable bids, each with time-adjusted price
  const physCandidates = [];

  // Trades (always preferred over bids if present)
  phys92Trades.forEach(t => {
    const { normalized, timeAdj, laycanMid } = timeAdjust(t.price, t.strip);
    physCandidates.push({
      source: 'trade',
      mm: t.seller,
      price: t.price,
      normalized,
      timeAdj,
      laycanMid,
      strip: t.strip,
      time: t.order_time?.substring(11, 19) || t.time,
    });
  });

  // Demonstrable bids (only if no trades, or add for comparison if trades exist)
  if (phys92Trades.length === 0 && bestDemonstrableBid) {
    const { normalized, timeAdj, laycanMid } = timeAdjust(bestDemonstrableBid.price, bestDemonstrableBid.strip);
    physCandidates.push({
      source: 'demonstrable_bid',
      mm: bestDemonstrableBid.mm,
      price: bestDemonstrableBid.price,
      normalized,
      timeAdj,
      laycanMid,
      strip: bestDemonstrableBid.strip,
      time: bestDemonstrableBid.time,
    });
  }

  if (physCandidates.length > 0) {
    // Best candidate = highest time-adjusted (normalized) price
    physCandidates.sort((a, b) => b.normalized - a.normalized);
    const best = physCandidates[0];
    physAssessmentDetail = best;
    physPremium92 = mopsStrip ? parseFloat((best.normalized - mopsStrip).toFixed(2)) : null;
    physPremiumStatus = phys92Trades.length > 0 ? 'traded' : 'demonstrable';

  } else if (bestAnyBid) {
    // No demonstrable bid → Platts will use notional physical cash differential
    // We cannot replicate notional from eWindow; show the highest bid for reference only
    const { normalized, timeAdj, laycanMid } = timeAdjust(bestAnyBid.price, bestAnyBid.strip);
    physAssessmentDetail = { source: 'non_demonstrable_bid', mm: bestAnyBid.mm, price: bestAnyBid.price, normalized, timeAdj, laycanMid, strip: bestAnyBid.strip };
    physPremium92 = mopsStrip ? parseFloat((normalized - mopsStrip).toFixed(2)) : null;
    const cls = classifyBid(bestAnyBid.price).class;
    physPremiumStatus = cls === 'swap_parity' ? 'swap_parity' : 'below_parity';
  }

  // Annotate all top bids with their demonstrability class for display
  const phys92AnnotatedBids = allPhys92Ranked.slice(0, 5).map(b => ({
    mm: b.market_maker_mnemonic,
    price: b.price,
    strip: b.strip,
    state: b.order_state,
    time: b.order_time?.substring(11, 19),
    category: b.category,
    ...classifyBid(b.price),
  }));

  const physCrossCheck = (bestAnyBid && mopsStrip) ? {
    physBid: bestAnyBid.price,
    bidCategory: bestAnyBid.category,
    swapBal: swapBalBest ?? swapBal,
    diffToSwapBal: classifyBid(bestAnyBid.price).diff,
    impliedPremium: parseFloat((bestAnyBid.price - mopsStrip).toFixed(2)),
    status: physPremiumStatus,
  } : null;

  return {
    date,
    labels: lbl,
    physical: {
      r92: {
        trades: phys92Trades.map(t => ({
          buyer: t.buyer || t.counterparty,
          seller: t.seller || t.market_maker,
          price: t.price,
          qty: t.deal_quantity || t.order_quantity,
          strip: t.strip,
          time: t.order_time?.substring(11, 19),
        })),
        diffTrades: phys92DiffTrades.map(t => ({
          buyer: t.buyer || t.counterparty,
          seller: t.seller || t.market_maker,
          price: t.price,
          qty: t.deal_quantity || t.order_quantity,
          strip: t.strip,
          time: t.order_time?.substring(11, 19),
        })),
        topBids: phys92AnnotatedBids,
        physPremium: physPremium92,
        physPremiumStatus,
        swapBal: swapBalBest ?? swapBal,
        physAssessment: physAssessmentDetail,
        bestDemonstrableBid: bestDemonstrableBid ? {
          price: bestDemonstrableBid.price, mm: bestDemonstrableBid.market_maker_mnemonic,
          strip: bestDemonstrableBid.strip, category: bestDemonstrableBid.category,
          time: bestDemonstrableBid.order_time?.substring(11, 19),
          diff: classifyBid(bestDemonstrableBid.price).diff,
        } : null,
      },
      r95: {
        trades: phys95Trades.map(t => ({
          buyer: t.buyer || t.counterparty,
          seller: t.seller || t.market_maker,
          price: t.price,
          qty: t.deal_quantity || t.order_quantity,
          strip: t.strip,
          time: t.order_time?.substring(11, 19),
        })),
        topBids: phys95Bids.slice(0, 3).map(b => ({
          mm: b.market_maker_mnemonic,
          price: b.price,
          strip: b.strip,
        })),
      },
    },
    swap: {
      balMonth: {
        trades: swapBalMonth.length,
        vwap: balMonthTradeVwap,
      },
      m1: {
        strip: lbl.m1,
        trades: swapM1.map(t => ({
          buyer: t.buyer_mnemonic || t.counterparty_mnemonic,
          seller: t.seller_mnemonic || t.market_maker_mnemonic,
          price: t.price,
          qty: t.order_quantity,
          time: t.order_time?.substring(11, 19),
          mm: t.market_maker_mnemonic,
        })),
        vwap: m1Vwap,
        assessment: m1Assessment,
        highestBid: swapM1Bids[0]?.price,
        lowestOffer: swapM1Offers[0]?.price,
      },
      m2: { strip: lbl.m2, vwap: vwap(swapM2) },
      m3: { strip: lbl.m3, vwap: vwap(swapM3) },
    },
    spreads: {
      balM1: { strip: lbl.balM1Spr, trades: spreadBalM1.map(r => r.price), avg: balM1SprAvg },
      m1m2:  { strip: lbl.m1m2Spr, trades: spreadM1M2.map(r => r.price), avg: m1m2SprAvg },
      m2m3:  { strip: lbl.m2m3Spr, trades: spreadM2M3.map(r => r.price), avg: m2m3SprAvg },
    },
    kdc,
    kdcCheck,
    mopsStrip: mopsStripData,
    physCrossCheck,
    m1AssessmentSource,
    // Legacy fields for compatibility
    strip: { m1: parseFloat(m1Assessment), m2: m2 ? parseFloat(m2) : null, m3: m3 ? parseFloat(m3) : null },
    assessment92: mopsStripData?.mopsStrip?.toFixed(2) || m1Assessment, // MOPS Strip = true assessment
    m1SwapVwap: m1Vwap, // Raw M1 swap VWAP (PRFEY00) — input to strip calc, not the final assessment
  };
}

// ── Formatter ──
export function formatReport(d, date) {
  const f = (v) => v != null ? '$' + v + '/bbl' : 'N/A';
  const lines = [];
  const lbl = d.labels || {};

  lines.push(`🛢️ Singapore Mogas MOC — ${date}`);
  lines.push('');

  // MOPS Assessment (Strip)
  lines.push('[MOPS 92 RON Assessment]');
  const m1src = d.m1AssessmentSource || '';
  lines.push(`M1 (PRFEY00): ${f(d.m1SwapVwap || d.swap?.m1?.assessment)}  [${m1src}]`);
  if (d.mopsStrip) {
    const ms = d.mopsStrip;
    const estMark = ms.isEstimate ? ' ⚠️估算' : '';
    const phaseLbl = ms.phase === 'M1/M2' ? 'M1/M2期' : 'Bal/M1期';
    lines.push(`MOPS Strip (AAXEQ00): ${f(ms.mopsStrip)}${estMark}  [${phaseLbl}]`);
    const frontLbl = ms.phase === 'M1/M2' ? 'M1(frontMonth)' : 'Bal Month';
    const spreadLbl = ms.phase === 'M1/M2' ? 'M1/M2 spread' : 'Bal/M1 spread';
    lines.push(`  └ ${frontLbl}: ${f(ms.frontMonthPrice)}  ${spreadLbl}: -${ms.spread}  DS: ${ms.dailyStructure}/bbl  daysToMid: ${ms.daysToMid}`);
    lines.push(`  └ 来源: ${ms.source}`);
    if (d.kdcCheck) {
      const gap = d.kdcCheck.gap;
      const gapStr = gap >= 0 ? `+${gap}` : `${gap}`;
      lines.push(`  └ KDC校验: ${f(d.kdcCheck.strip)} (Bal Month ${d.kdcCheck.balMonth}, spread ${d.kdcCheck.spread}) 差: ${gapStr}/bbl`);
    }
  } else {
    lines.push('MOPS Strip: eWindow数据不足（无M1成交/出价）');
  }
  lines.push('');

  // Physical
  lines.push('[物理 Cargo FOB Straits]');
  const r92 = d.physical.r92;
  const pa = r92.physAssessment;  // time-adjusted assessment detail
  if (r92.trades.length) {
    r92.trades.forEach(t =>
      lines.push(`92 RON: ${t.seller} → ${t.buyer} ${f(t.price)} ${t.strip} (${t.time})`)
    );
  } else {
    const db = r92.bestDemonstrableBid;
    const ab = r92.topBids[0];  // highest bid regardless of demonstrability
    if (db) {
      lines.push(`92 RON: 无成交，最高 demonstrable bid ${f(db.price)} (${db.mm}, ${db.strip}, ${db.category}, ${db.time})`);
      lines.push(`     vs swap Bal Month ${f(r92.swapBal)}: +${db.diff}/bbl above parity`);
    } else if (ab) {
      const cls = ab.class === 'swap_parity' ? 'swap parity' : 'below parity';
      lines.push(`92 RON: 无成交，最高 bid ${f(ab.price)} (${ab.mm}, ${ab.strip}, ${ab.category}, ${ab.time})`);
      lines.push(`     vs swap Bal Month ${f(r92.swapBal)}: ${ab.diff}/bbl [${cls}] ⚠️ non-demonstrable`);
    } else {
      lines.push('92 RON: 无成交，无有效 bid');
    }
  }
  // Show time-adjustment detail
  if (pa) {
    const adjSign = pa.timeAdj >= 0 ? '+' : '';
    if (pa.timeAdj !== 0) {
      lines.push(`     时间校正: ${f(pa.price)} (${pa.strip}) ${adjSign}${pa.timeAdj} → 标准化 ${f(pa.normalized)}`);
    }
    const status = r92.physPremiumStatus;
    let premiumLine = `     Physical assessment: ${f(pa.normalized)}  →  premium vs Strip: ${r92.physPremium >= 0 ? '+' : ''}${r92.physPremium}/bbl`;
    if (status === 'traded') premiumLine += '  ✅ [成交时调]';
    else if (status === 'demonstrable') premiumLine += '  ✅ [demonstrable bid 时调]';
    else if (status === 'swap_parity') premiumLine += '  ⚠️ [swap parity, Platts likely notional]';
    else if (status === 'below_parity') premiumLine += '  ⚠️ [below parity, Platts likely notional]';
    lines.push(premiumLine);
  } else if (r92.physPremiumStatus === 'no_bid') {
    lines.push('     Physical premium: 无有效 bid — Platts used notional assessment');
  }
  if (d.physical.r95.trades.length) {
    d.physical.r95.trades.forEach(t =>
      lines.push(`95 RON: ${t.seller} → ${t.buyer} ${f(t.price)} ${t.strip} (${t.time})`)
    );
  } else {
    const b = d.physical.r95.topBids[0];
    lines.push(`95 RON: 无成交${b ? '，最高 bid ' + f(b.price) + ' (' + b.mm + ')' : ''}`);
  }
  lines.push('');

  // Swap M1
  const m1Data = d.swap?.m1 || d.swap?.apr;
  lines.push(`[Paper/Swap MOC — 92 RON ${lbl.m1 || 'M1'}]`);
  if (m1Data?.trades?.length) {
    lines.push(`成交 VWAP: ${f(m1Data.vwap)} (${m1Data.trades.length}笔)`);
    m1Data.trades.forEach(t => {
      const seller = t.seller || t.mm;
      lines.push(`  ${seller} → ${t.buyer} ${f(t.price)} ${t.qty}kb (${t.time})`);
    });
  } else {
    lines.push(`无成交，最高 bid: ${f(m1Data?.highestBid)}  最低 offer: ${f(m1Data?.lowestOffer)}`);
  }
  lines.push('');

  // Strip curve
  lines.push('[92 RON Swap Curve]');
  lines.push(`Bal Month: ${f(d.swap?.balMonth?.vwap)}  (${d.swap?.balMonth?.trades || 0}笔)`);
  lines.push(`M1 ${lbl.m1 || ''}: ${f(d.strip?.m1)}`);
  lines.push(`M2 ${lbl.m2 || ''}: ${f(d.strip?.m2)}`);
  lines.push(`M3 ${lbl.m3 || ''}: ${f(d.strip?.m3)}`);
  lines.push('');

  // Structure
  lines.push('[Daily Structure]');
  if (d.spreads?.balM1?.avg) {
    const sprs = d.spreads.balM1.trades.join(' / ');
    lines.push(`Bal/M1 (${lbl.balM1Spr || ''}): -${d.spreads.balM1.avg}/bbl (${sprs || '无成交'})`);
  }
  if (d.spreads?.m1m2?.avg) {
    const sprs = d.spreads.m1m2.trades.join(' / ');
    lines.push(`M1/M2 (${lbl.m1m2Spr || ''}): -${d.spreads.m1m2.avg}/bbl (${sprs})`);
  }
  if (d.spreads?.m2m3?.avg) {
    const sprs = d.spreads.m2m3.trades.join(' / ');
    lines.push(`M2/M3 (${lbl.m2m3Spr || ''}): -${d.spreads.m2m3.avg}/bbl (${sprs})`);
  }

  return lines.join('\n');
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const date = process.argv[2] || new Date().toISOString().split('T')[0];
  analyzeMogasMOC(date).then(d => {
    console.log(JSON.stringify(d, null, 2));
    console.log('\n' + '─'.repeat(60) + '\n');
    console.log(formatReport(d, date));
  }).catch(e => { console.error(e); process.exit(1); });
}
