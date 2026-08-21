const { readFileSync } = require('fs');
const date='2026-04-28';
const token=JSON.parse(readFileSync('.config/spglobal/credentials.json','utf8')).access_token;
async function heard(q){
 const u='https://api.platts.com/news-insights/v1/search/heards?pageSize=50&q='+encodeURIComponent(q);
 const d=await fetch(u,{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
 const rows=(d.results||[]).filter(x=>(x.updatedDate||'').startsWith(date));
 console.log('\nQUERY',q,'count',rows.length);
 for (const x of rows.slice(0,20)) console.log(x.updatedDate,'|',x.headline);
}
(async()=>{
 for (const q of ['declares a cargo','declares a cargo of May','declares a cargo of June','Mideast Sour Crude Convergences','Cash Oman Heard At','Cash Murban Heard At','Dubai Assessment','Physical premium','CRUDE MARKETS: FINALS ON CLOSE','ME SOUR CRUDE OFFERS','ME SOUR CRUDE BIDS','DUBAI PARTIALS:','ASIA CRUDE DEALS SUMMARY']) await heard(q);
})();