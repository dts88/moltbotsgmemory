const { readFileSync } = require('fs');
const creds=JSON.parse(readFileSync('.config/spglobal/credentials.json','utf8'));
const token=creds.access_token; const appkey='mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN'; const date='2026-04-24';
async function search(q){const u=new URL('https://api.platts.com/news-insights/v1/search/heards');u.searchParams.set('q',q);u.searchParams.set('pageSize','20');const d=await fetch(u,{headers:{Authorization:'Bearer '+token,appkey}}).then(r=>r.json());return (d.results||[]).filter(x=>(x.updatedDate||'').startsWith(date));}
(async()=>{
for (const q of ['CRUDE MARKETS FINALS ON CLOSE','Dubai Assessment','Physical premium','PCAAT00','AAVMR00','Dubai crude assessments']){
 const r=await search(q); console.log('\nQUERY',q,r.length); r.slice(-10).forEach(x=>console.log(x.updatedDate,'|',x.headline,'|',x.id));
}
})();