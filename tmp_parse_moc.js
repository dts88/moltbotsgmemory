import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync('reports/moc-daily/2026-04-30.json', 'utf8'));
const offers = data.ewindow.offers || [];
const trades = data.ewindow.trades || [];
const declares = (data.heards.declares || []).filter(x => /declares a cargo/i.test(x.headline || ''));
const murban = data.heards.murban || [];
const oman = data.heards.oman || [];

function norm(n) { return Number(n).toFixed(2); }

const bySeller = {};
const byBuyer = {};
for (const t of trades) {
  const seller = t.seller_mnemonic || t.market_maker_mnemonic || '?';
  const buyer = t.buyer_mnemonic || t.counterparty_mnemonic || '?';
  bySeller[seller] = (bySeller[seller] || 0) + 1;
  byBuyer[buyer] = (byBuyer[buyer] || 0) + 1;
}
const uniqueBuyers = Object.keys(byBuyer);
const prices = trades.map(t => Number(t.price)).filter(Number.isFinite);
const finalPrice = prices.at(-1);
const contractMonths = [...new Set(trades.map(t => t.instrument_code || t.description || t.instrument || t.market))];
const lastMin = offers.filter(r => r.order_time >= `${data.date}T04:29:00` && r.order_time < `${data.date}T04:30:00`);
const byLast = {};
for (const r of lastMin) {
  const mm = r.market_maker_mnemonic || '?';
  if (!byLast[mm]) byLast[mm] = [];
  byLast[mm].push(Number(r.price));
}
const lastMinSummary = Object.entries(byLast).map(([k, arr]) => ({ mm:k, count: arr.length, min: Math.min(...arr), last: arr.at(-1) })).sort((a,b)=>a.min-b.min);
const sellerSummary = Object.entries(bySeller).sort((a,b)=>b[1]-a[1]);

function parseDecl(h) {
  const m = h.match(/Platts Crude: (.*?) declares a cargo of (\w+) (.*?) crude to (.*?) following/i);
  if (!m) return null;
  return { seller: m[1], month: m[2], grade: m[3], buyer: m[4] };
}
const parsedDecl = declares.map(d => ({...parseDecl(d.headline), time: d.updatedDate, headline: d.headline})).filter(Boolean);
const groupedDecl = [];
for (const d of parsedDecl) {
  const prev = groupedDecl[groupedDecl.length-1];
  if (prev && prev.seller===d.seller && prev.buyer===d.buyer && prev.month===d.month && prev.grade===d.grade) prev.count++;
  else groupedDecl.push({ ...d, count:1 });
}

function parseCash(items, label) {
  return items.map(x => {
    const h = x.headline || '';
    const m = h.match(/Cash .*? Heard At \+?\$?(\d+\.\d+)/i);
    return { time: x.updatedDate, value: m ? Number(m[1]) : null, headline: h };
  });
}
const cashMurban = parseCash(murban, 'Murban');
const cashOman = parseCash(oman, 'Oman');

console.log(JSON.stringify({
  tradeCount: trades.length,
  finalPrice,
  priceMin: Math.min(...prices),
  priceMax: Math.max(...prices),
  uniqueBuyers,
  sellerSummary,
  lastMinSummary,
  groupedDecl,
  cashMurban,
  cashOman,
  sampleTrade: trades.at(-1)
}, null, 2));