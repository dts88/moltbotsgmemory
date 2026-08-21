const { readFileSync } = require('fs');
const raw = JSON.parse(readFileSync('reports/moc-daily/2026-04-29.raw.json','utf8'));
for (const r of raw.ewindow.trades) {
  console.log([r.order_time, r.buyer_mnemonic, r.seller_mnemonic || r.market_maker_mnemonic, r.price].join(' | '));
}