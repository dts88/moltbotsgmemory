const { readFileSync } = require('fs');
const raw = JSON.parse(readFileSync('reports/moc-daily/2026-04-29.raw.json','utf8'));
raw.deals.slice(-20).forEach(x => console.log(x.updatedDate + ' | ' + x.headline));