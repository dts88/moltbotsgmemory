#!/usr/bin/env node
/**
 * mogas-mops-strip.mjs
 * 计算 Singapore Mogas 92 RON MOPS Strip & Daily Structure
 *
 * 输入（从 eWindow）：
 *   A) Bal Month outright bid/offer  ("Platts Mogas 92 (balmo)" / "Bal Month")
 *   B) Bal Month / M1 spread bid/offer  ("Platts Mogas 92 Spr" / "Bal Month/Apr26")
 *   C) M1 outright VWAP（consummated trades）或 bid/offer midpoint
 *
 * 输出：
 *   - 在 bid~offer 区间内按 0/25/50/75/100% 计算多个价格点
 *   - 每个点输出：Bal Month 价格 / Daily Structure ($/b) / MOPS Strip
 *
 * 用法：
 *   node scripts/mogas-mops-strip.mjs [YYYY-MM-DD]
 */

import { readFileSync } from 'fs';

const BASE   = 'https://api.platts.com/tradedata/v3';
const MARKET = 'ASIA Mogas Swap';

function getToken() {
  return JSON.parse(readFileSync('/home/node/clawd/.config/spglobal/credentials.json', 'utf8')).access_token;
}

async function ewGet(filter) {
  const r = await fetch(
    `${BASE}/ewindowdata?filter=${encodeURIComponent(filter)}&sort=price:desc&pageSize=500`,
    { headers: { 'Authorization': 'Bearer ' + getToken(), 'Accept': 'application/json' } }
  );
  if (!r.ok) throw new Error(`eWindow ${r.status}`);
  return (await r.json()).results || [];
}

// ── 日期工具 ─────────────────────────────────────────────────────────────────

function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function _stripName(y, m) {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]
       + String(y).slice(2);
}

/**
 * 计算 MOPS Strip 所需日期参数
 * 严格按照 KDC 方式：mid 取 floor（向下取整）
 */
function calcDateParams(today) {
  const year  = today.getFullYear();
  const month = today.getMonth() + 1;
  const day   = today.getDate();

  const win15 = addDays(today, 15);
  const win30 = addDays(today, 30);

  // mid-window（从当月1日起算的天数，保留小数）
  const refDate   = new Date(year, month - 1, 1);
  const midWinDate = new Date((win15.getTime() + win30.getTime()) / 2);
  const midWinDay  = (midWinDate - refDate) / 864e5 + 1;  // e.g. 34.5

  // 15天远期是否已进入下月
  const useM1M2 = (win15.getMonth() + 1) !== month;

  let spreadLabel, balLabel, m1Label, midEarlierDay, midLaterDay;

  if (!useM1M2) {
    // ─ Bal Month / M1 ─
    const lastDay = daysInMonth(year, month);
    // mid-BalMonth: KDC 用 floor((day + lastDay) / 2)
    midEarlierDay = Math.floor((day + lastDay) / 2);

    const m1M = month === 12 ? 1 : month + 1;
    const m1Y = month === 12 ? year + 1 : year;
    const dM1 = daysInMonth(m1Y, m1M);
    // mid-M1: KDC 用 floor((1 + dM1) / 2)
    midLaterDay = lastDay + Math.floor((1 + dM1) / 2);

    m1Label    = _stripName(m1Y, m1M);
    balLabel   = 'Bal Month';
    spreadLabel = `Bal Month/${m1Label}`;
  } else {
    // ─ M1 / M2 ─
    const m1M = win15.getMonth() + 1, m1Y = win15.getFullYear();
    const m2M = m1M === 12 ? 1 : m1M + 1, m2Y = m1M === 12 ? m1Y + 1 : m1Y;
    const lastDayCur = daysInMonth(year, month);
    const dM1 = daysInMonth(m1Y, m1M), dM2 = daysInMonth(m2Y, m2M);
    midEarlierDay = lastDayCur + Math.floor((1 + dM1) / 2);
    midLaterDay   = lastDayCur + dM1 + Math.floor((1 + dM2) / 2);
    m1Label    = _stripName(m1Y, m1M);
    balLabel   = m1Label;
    spreadLabel = `${m1Label}/${_stripName(m2Y, m2M)}`;
  }

  const daysBetween  = midLaterDay - midEarlierDay;   // e.g. 25
  const daysToMidWin = midWinDay   - midEarlierDay;   // e.g. 13.5

  return { useM1M2, spreadLabel, balLabel, m1Label,
           midEarlierDay, midLaterDay, midWinDay: +midWinDay.toFixed(1),
           daysBetween, daysToMidWin: +daysToMidWin.toFixed(1) };
}

// ── eWindow 数据获取 ──────────────────────────────────────────────────────────

async function getM1Price(date, m1Strip) {
  // 优先：consummated outright trades（Platts 用来发布 PRFEY00 的）
  const all = await ewGet(
    `market="${MARKET}" AND order_date="${date}" AND order_state="consummated" AND order_spread="F"`
  );
  const trades = all.filter(r => r.product === 'Platts Mogas 92' && r.strip === m1Strip);
  if (trades.length) {
    const vol  = trades.reduce((s,r) => s + r.order_quantity, 0);
    const vwap = trades.reduce((s,r) => s + r.price * r.order_quantity, 0) / vol;
    return { price: +vwap.toFixed(2), source: `VWAP ${trades.length}笔 ${vol}kb` };
  }
  // Fallback：bid/offer 中点
  const book = await ewGet(`market="${MARKET}" AND order_date="${date}" AND order_state="inactive"`);
  const bids   = book.filter(r => r.product === 'Platts Mogas 92' && r.strip === m1Strip && r.order_type === 'Bid');
  const offers = book.filter(r => r.product === 'Platts Mogas 92' && r.strip === m1Strip && r.order_type === 'Offer');
  const bestBid   = bids.sort((a,b) => b.price - a.price)[0]?.price;
  const bestOffer = offers.sort((a,b) => a.price - b.price)[0]?.price;
  if (bestBid && bestOffer)
    return { price: +((bestBid + bestOffer) / 2).toFixed(2), source: `Mid ${bestBid}/${bestOffer}` };
  if (bestBid)   return { price: bestBid,   source: `Bid only ${bestBid}` };
  if (bestOffer) return { price: bestOffer, source: `Offer only ${bestOffer}` };
  return null;
}

/**
 * 从 eWindow 拿 Bal Month outright bid/offer（可直接用于计算 Bal Month 价格）
 * 以及 Bal/M1 spread bid/offer（加上 M1 价格可得 Bal Month）
 * 返回两种方式下的 bid/offer
 */
async function getBalMonthInputs(date, spreadLabel) {
  const base = `market="${MARKET}" AND order_date="${date}"`;

  // 分开查询避免分页截断
  const [balBidRecs, balOfferRecs, sprBidRecs, sprOfferRecs, sprConsRecs] = await Promise.all([
    ewGet(`${base} AND order_type="Bid"   AND order_spread="F" AND order_state in ("active","inactive")`),
    ewGet(`${base} AND order_type="Offer" AND order_spread="F" AND order_state in ("active","inactive")`),
    ewGet(`${base} AND order_type="Bid"   AND order_spread="T" AND order_state in ("active","inactive")`),
    ewGet(`${base} AND order_type="Offer" AND order_spread="T" AND order_state in ("active","inactive")`),
    ewGet(`${base} AND order_spread="T"   AND order_state="consummated"`),
  ]);

  // A) Bal Month outright
  const balOutrightBid   = balBidRecs.filter(r  => r.product === 'Platts Mogas 92 (balmo)' && r.strip === 'Bal Month')
                                      .sort((a,b) => b.price - a.price)[0] ?? null;
  const balOutrightOffer = balOfferRecs.filter(r => r.product === 'Platts Mogas 92 (balmo)' && r.strip === 'Bal Month')
                                        .sort((a,b) => a.price - b.price)[0] ?? null;

  // B) Bal/M1 spread
  const sprBestBid   = sprBidRecs.filter(r  => r.product === 'Platts Mogas 92 Spr' && r.strip === spreadLabel)
                                   .sort((a,b) => b.price - a.price)[0] ?? null;
  const sprBestOffer = sprOfferRecs.filter(r => r.product === 'Platts Mogas 92 Spr' && r.strip === spreadLabel)
                                    .sort((a,b) => a.price - b.price)[0] ?? null;

  // C) Spread 成交
  const consSpread  = sprConsRecs.filter(r => r.strip === spreadLabel);
  const sprTradeAvg = consSpread.length
    ? +(consSpread.reduce((s,r) => s + r.price, 0) / consSpread.length).toFixed(2) : null;

  return { balOutrightBid, balOutrightOffer,
           sprBestBid, sprBestOffer,
           sprTradeAvg, sprTradeN: consSpread.length };
}

// ── 核心计算 ──────────────────────────────────────────────────────────────────

function calcPoint(balMonthPrice, m1Price, daysBetween, daysToMidWin) {
  const spread         = +(balMonthPrice - m1Price).toFixed(2);
  const dailyStructure = +(spread / daysBetween).toFixed(4);
  const mopsStrip      = +(balMonthPrice - dailyStructure * daysToMidWin).toFixed(2);
  return { balMonthPrice, spread, dailyStructure, mopsStrip };
}

function percentilePrice(low, high, pct) {
  return +(low + (high - low) * pct / 100).toFixed(2);
}

// ── 主函数 ────────────────────────────────────────────────────────────────────

export async function calcMopsStrip(dateStr) {
  const today  = new Date(dateStr + 'T00:00:00');
  const params = calcDateParams(today);
  const { spreadLabel, balLabel, m1Label,
          midEarlierDay, midLaterDay, midWinDay,
          daysBetween, daysToMidWin } = params;

  const [m1Info, inputs] = await Promise.all([
    getM1Price(dateStr, m1Label),
    getBalMonthInputs(dateStr, spreadLabel),
  ]);

  if (!m1Info) throw new Error(`Cannot determine M1 (${m1Label}) price`);

  const { balOutrightBid, balOutrightOffer,
          sprBestBid, sprBestOffer,
          sprTradeAvg, sprTradeN } = inputs;

  // 决定用哪个 Bal Month 范围
  // 优先：spread 市场（通常更活跃）；备用：outright
  let balLow = null, balHigh = null, method;
  if (sprBestBid !== null && sprBestOffer !== null) {
    balLow  = +(m1Info.price + sprBestBid.price).toFixed(2);
    balHigh = +(m1Info.price + sprBestOffer.price).toFixed(2);
    method  = `spread (${spreadLabel})`;
  } else if (balOutrightBid !== null && balOutrightOffer !== null) {
    balLow  = balOutrightBid.price;
    balHigh = balOutrightOffer.price;
    method  = 'outright Bal Month bid/offer';
  } else if (sprBestBid !== null) {
    balLow = balHigh = +(m1Info.price + sprBestBid.price).toFixed(2);
    method  = `spread bid only (${sprBestBid.price})`;
  } else if (balOutrightBid !== null) {
    balLow = balHigh = balOutrightBid.price;
    method  = 'outright bid only';
  }

  // 计算 5 个百分位
  const PCTS = [0, 25, 50, 75, 100];
  const results = [];
  if (balLow !== null) {
    for (const pct of PCTS) {
      const balP = percentilePrice(balLow, balHigh, pct);
      results.push({ pct, ...calcPoint(balP, m1Info.price, daysBetween, daysToMidWin) });
    }
    // 如果 spread 有成交，加一行
    if (sprTradeAvg !== null) {
      const balT = +(m1Info.price + sprTradeAvg).toFixed(2);
      results.push({ pct: 'traded', ...calcPoint(balT, m1Info.price, daysBetween, daysToMidWin) });
    }
  }

  return {
    date: dateStr,
    useM1M2: params.useM1M2,
    spreadLabel, balLabel, m1Label,
    m1Price: m1Info.price, m1Source: m1Info.source,
    midEarlierDay, midLaterDay, midWinDay,
    daysBetween, daysToMidWin,
    // 原始 bid/offer
    balOutrightBid:   balOutrightBid?.price   ?? null,
    balOutrightOffer: balOutrightOffer?.price  ?? null,
    balOutrightBidMM:   balOutrightBid?.market_maker_mnemonic   ?? null,
    balOutrightOfferMM: balOutrightOffer?.market_maker_mnemonic ?? null,
    sprBid:   sprBestBid?.price   ?? null,
    sprOffer: sprBestOffer?.price ?? null,
    sprBidMM:   sprBestBid?.market_maker_mnemonic   ?? null,
    sprOfferMM: sprBestOffer?.market_maker_mnemonic ?? null,
    sprTradeAvg, sprTradeN,
    balRangeLow: balLow, balRangeHigh: balHigh,
    method,
    results,
  };
}

// ── 格式化 ────────────────────────────────────────────────────────────────────

function fmt(d) {
  const L = [];
  L.push(`Singapore Mogas MOPS Strip — ${d.date}`);
  L.push(`method: ${d.useM1M2 ? 'M1/M2' : 'BalMonth/M1'}  |  spread: ${d.spreadLabel}`);
  L.push('');
  L.push(`M1 (${d.m1Label}): $${d.m1Price}/b  [${d.m1Source}]`);
  L.push('');
  L.push('Date params:');
  L.push(`  mid-${d.balLabel.padEnd(12)} = day ${d.midEarlierDay}`);
  L.push(`  mid-${d.m1Label.padEnd(12)} = day ${d.midLaterDay}`);
  L.push(`  mid-window       = day ${d.midWinDay}`);
  L.push(`  days between mids          = ${d.daysBetween}`);
  L.push(`  days mid-earlier→mid-win   = ${d.daysToMidWin}`);
  L.push('');
  L.push('Inputs:');
  if (d.balOutrightBid   !== null) L.push(`  Bal Month outright bid:   $${d.balOutrightBid}   (${d.balOutrightBidMM})`);
  if (d.balOutrightOffer !== null) L.push(`  Bal Month outright offer: $${d.balOutrightOffer}  (${d.balOutrightOfferMM})`);
  if (d.sprBid   !== null) L.push(`  ${d.spreadLabel} spread bid:   $${d.sprBid}   (${d.sprBidMM})  →  Bal Month = $${(d.m1Price + d.sprBid).toFixed(2)}`);
  if (d.sprOffer !== null) L.push(`  ${d.spreadLabel} spread offer: $${d.sprOffer} (${d.sprOfferMM})  →  Bal Month = $${(d.m1Price + d.sprOffer).toFixed(2)}`);
  if (d.sprTradeAvg !== null) L.push(`  ${d.spreadLabel} spread trade avg: $${d.sprTradeAvg} (${d.sprTradeN} trades)`);
  L.push(`  Bal Month range: $${d.balRangeLow} ~ $${d.balRangeHigh}  [from ${d.method}]`);
  L.push('');
  L.push(`${'Pct'.padStart(8)}  ${'BalMonth'.padStart(9)}  ${'Spread'.padStart(8)}  ${'DailyStr'.padStart(10)}  ${'MOPS Strip'.padStart(10)}`);
  L.push('─'.repeat(55));
  for (const r of d.results) {
    const pct = r.pct === 'traded' ? 'traded' : `${r.pct}%`;
    L.push(
      pct.padStart(8)
      + ('$'+r.balMonthPrice).padStart(10)
      + ('$'+r.spread).padStart(9)
      + (r.dailyStructure.toFixed(4)+'/b').padStart(11)
      + ('$'+r.mopsStrip).padStart(11)
    );
  }
  return L.join('\n');
}

// ── CLI ───────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const date = process.argv[2] || new Date().toISOString().split('T')[0];
  calcMopsStrip(date)
    .then(d => { console.log(fmt(d)); })
    .catch(e => { console.error(e.message); process.exit(1); });
}
