const { readFileSync } = require('fs');
const creds=JSON.parse(readFileSync('.config/spglobal/credentials.json','utf8'));
const token=creds.access_token; const appkey='mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN'; const date='2026-04-24';
async function search(q){const u=new URL('https://api.platts.com/news-insights/v1/search/heards');u.searchParams.set('q',q);u.searchParams.set('pageSize','50');const d=await fetch(u,{headers:{Authorization:'Bearer '+token,appkey}}).then(r=>r.json());return (d.results||[]).filter(x=>(x.updatedDate||'').startsWith(date)).sort((a,b)=>new Date(a.updatedDate)-new Date(b.updatedDate));}
(async()=>{
for (const q of ['DEALS SUMMARY DUBAI PARTIALS','PLATTS ASIA DEALS SUMMARY DUBAI PARTIALS','PARTIALS','Unipec sells to']) {
 const r=await search(q); console.log('\nQUERY',q,'count',r.length); r.slice(-20).forEach(x=>console.log(x.updatedDate,'|',x.headline));
}
})();