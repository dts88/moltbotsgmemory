const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const date='2026-04-28';
const token=JSON.parse(readFileSync('.config/spglobal/credentials.json','utf8')).access_token;
async function search(q, pageSize=500){
  const u='https://api.platts.com/news-insights/v1/search/heards?pageSize='+pageSize+'&q='+encodeURIComponent(q);
  const d=await fetch(u,{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
  return (d.results||[]).filter(x=>(x.updatedDate||'').startsWith(date)).sort((a,b)=>new Date(a.updatedDate)-new Date(b.updatedDate));
}
const num = s => { const m=s.match(/\$(\d+(?:\.\d+)?)/); return m?Number(m[1]):null; };
const dedupe = rows => rows.filter((r,i,a)=>i===a.findIndex(x=>x.headline===r.headline&&x.updatedDate===r.updatedDate));
(async()=>{
  const partials = dedupe(await search('DUBAI PARTIAL',500));
  const declarations = dedupe((await search('declares a cargo',200)).filter(x=>/declares a cargo/i.test(x.headline)));
  const cashMurbanRows = dedupe((await search('Cash Murban Heard At',50)).filter(x=>/Cash Murban Heard At/i.test(x.headline)));
  const cashOmanRows = dedupe((await search('Cash Oman Heard At',50)).filter(x=>/Cash Oman Heard At/i.test(x.headline)));
  const bidSummary = dedupe(await search('ME SOUR CRUDE BIDS: SUMMARY',50));
  const offerSummary = dedupe(await search('ME SOUR CRUDE OFFERS: SUMMARY',50));
  const convergences = dedupe(await search('Mideast Sour Crude Convergences',50));

  const trades = partials.filter(r=>/ BUYS FROM /i.test(r.headline)).map(r=>{
    const m=r.headline.match(/Platts Dubai Partial (\w+\d+),\s+([^\s]+) BUYS FROM ([^\s]+)\s+\$(\d+(?:\.\d+)?) for (\d+)/i);
    return m?{contract:m[1],buyer:m[2],seller:m[3],price:Number(m[4]),volume:Number(m[5]),time:r.updatedDate,headline:r.headline}:{headline:r.headline,time:r.updatedDate};
  });
  const offers = partials.filter(r=>/ offer \$/i.test(r.headline)).map(r=>{
    const m=r.headline.match(/Platts Dubai Partial (\w+\d+),\s+([^\s]+).*offer \$(\d+(?:\.\d+)?) for (\d+)/i);
    return m?{contract:m[1],company:m[2],price:Number(m[3]),volume:Number(m[4]),time:r.updatedDate,headline:r.headline}:{headline:r.headline,time:r.updatedDate};
  });
  const bids = partials.filter(r=>/ bid \$/i.test(r.headline)).map(r=>{
    const m=r.headline.match(/Platts Dubai Partial (\w+\d+),\s+([^\s]+).*bid \$(\d+(?:\.\d+)?) for (\d+)/i);
    return m?{contract:m[1],company:m[2],price:Number(m[3]),volume:Number(m[4]),time:r.updatedDate,headline:r.headline}:{headline:r.headline,time:r.updatedDate};
  });
  const lastMinuteOffers = offers.filter(x=>x.time>='2026-04-28T08:29:00Z'&&x.time<'2026-04-28T08:30:00Z');
  const cashMurban = cashMurbanRows.map(r=>({value:num(r.headline),time:r.updatedDate,headline:r.headline}));
  const cashOman = cashOmanRows.map(r=>({value:num(r.headline),time:r.updatedDate,headline:r.headline}));
  const out={
    date,
    fluxOfficials:{assessment:null,premium:null,text:'数据待更新'},
    declarations: declarations.map(r=>({headline:r.headline,time:r.updatedDate})),
    cashMurban,
    cashOman,
    errorTrades:[],
    finalsOnClose:{bids:bidSummary.map(r=>r.headline),offers:offerSummary.map(r=>r.headline)},
    partials:{trades,offers,lastMinuteOffers,bids,convergences:convergences.map(r=>r.headline)}
  };
  mkdirSync('reports/moc-daily',{recursive:true});
  writeFileSync(`reports/moc-daily/${date}.json`,JSON.stringify(out,null,2));
  console.log(JSON.stringify({trades,lastMinuteOffers:lastMinuteOffers.slice(-10),cashMurban,cashOman,bidSummary,offerSummary,declarations},null,2));
})();