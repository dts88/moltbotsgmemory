const { readFileSync } = require('fs');
const raw = JSON.parse(readFileSync('reports/moc-daily/2026-04-29.raw.json','utf8'));
const offers = raw.ewindow.offers;
const trades = raw.ewindow.trades;
const lastMin = offers.filter(r => r.order_time >= '2026-04-29T08:29:00' && r.order_time < '2026-04-29T08:30:00');
const byComp = {};
for (const r of offers) {
  const mm = r.market_maker_mnemonic || '?';
  byComp[mm] ??= {count:0, min:r.price, max:r.price};
  byComp[mm].count++; byComp[mm].min=Math.min(byComp[mm].min,r.price); byComp[mm].max=Math.max(byComp[mm].max,r.price);
}
const byLast={};
for (const r of lastMin) {
  const mm=r.market_maker_mnemonic||'?';
  byLast[mm] ??= {count:0, prices:[]};
  byLast[mm].count++; byLast[mm].prices.push(r.price);
}
const tradeSummary={};
for (const r of trades) {
  const k = `${r.buyer_mnemonic||'?'}<-${r.seller_mnemonic||r.market_maker_mnemonic||'?'}`;
  tradeSummary[k] ??= {count:0, prices:new Set(), times:[]};
  tradeSummary[k].count++; tradeSummary[k].prices.add(r.price); tradeSummary[k].times.push(r.order_time.slice(11,19));
}
console.log(JSON.stringify({
  trades: Object.entries(tradeSummary).map(([k,v])=>({k,count:v.count,prices:[...v.prices],first:v.times[0],last:v.times.at(-1)})),
  lastMinute: byLast,
  allday: byComp,
  murban: raw.cashMurban.map(x=>x.headline),
  oman: raw.cashOman.map(x=>x.headline),
  declarations: raw.declarations.map(x=>x.headline),
  dealsLast5: raw.deals.slice(-5).map(x=>x.headline)
}, null, 2));