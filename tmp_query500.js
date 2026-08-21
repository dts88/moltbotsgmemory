const { readFileSync } = require('fs');
const date='2026-04-28';
const token=JSON.parse(readFileSync('.config/spglobal/credentials.json','utf8')).access_token;
(async()=>{
 const u='https://api.platts.com/news-insights/v1/search/heards?pageSize=500&q='+encodeURIComponent('DUBAI PARTIAL');
 const d=await fetch(u,{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
 const rows=(d.results||[]).filter(x=>(x.updatedDate||'').startsWith(date)).sort((a,b)=>new Date(a.updatedDate)-new Date(b.updatedDate));
 console.log('count',rows.length);
 console.log('first',rows[0]?.updatedDate, rows[0]?.headline);
 console.log('last',rows.at(-1)?.updatedDate, rows.at(-1)?.headline);
 const trades=rows.filter(r=>/ BUYS FROM /i.test(r.headline));
 console.log('trades',trades.length);
 trades.slice(0,10).forEach(x=>console.log(x.updatedDate,'|',x.headline));
 trades.slice(-10).forEach(x=>console.log(x.updatedDate,'|',x.headline));
})();