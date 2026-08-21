import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const root='/home/node/clawd';
const creds=JSON.parse(readFileSync(root+'/.config/spglobal/credentials.json','utf8'));
const token=creds.access_token;
const APPKEY='mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN';
const date='2026-04-23';

async function j(url, headers={}){
  const r=await fetch(url,{headers});
  const txt=await r.text();
  if(!r.ok) throw new Error(`${r.status} ${txt.slice(0,400)}`);
  return JSON.parse(txt);
}
async function ew(params){
  const u=new URL('https://api.platts.com/tradedata/v3/ewindowdata');
  for (const [k,v] of Object.entries(params)) u.searchParams.set(k,v);
  return j(u,{Authorization:'Bearer '+token,Accept:'application/json'});
}
async function searchHeards(q){
  const u=new URL('https://api.platts.com/news-insights/v1/search/heards');
  u.searchParams.set('q',q); u.searchParams.set('pageSize','50');
  try {
    const d=await j(u,{Authorization:'Bearer '+token,appkey:APPKEY});
    return (d.results||[]).filter(x=>(x.updatedDate||'').startsWith(date)).sort((a,b)=>new Date(a.updatedDate)-new Date(b.updatedDate));
  } catch (e) {
    return [{error:String(e), headline:`QUERY_FAILED: ${q}`}];
  }
}
async function content(id){
  const u=`https://api.platts.com/news-insights/v1/content/${id}`;
  return j(u,{Authorization:'Bearer '+token,appkey:APPKEY});
}

const all=(await ew({filter:`market="ASIA Crude Partial" AND order_date="${date}"`,pageSize:'1000',sort:'order_time:asc'})).results||[];
const offers=all.filter(r=>r.order_type==='Offer');
const trades=all.filter(r=>r.order_state==='consummated');
const lastMinuteOffers=offers.filter(r=> (r.order_time||'')>=`${date}T08:29:00` && (r.order_time||'')<`${date}T08:30:00`);

const qs={
  declarations:'declares crude',
  deals:'DUBAI PARTIALS',
  cashMurban:'Cash Murban Heard At',
  cashOman:'Cash Oman Heard At',
  focBids:'ME SOUR CRUDE BIDS FINALS ON CLOSE',
  focOffers:'ME SOUR CRUDE OFFERS FINALS ON CLOSE',
  errors:'executed in error',
  convergences:'Mideast Sour Crude Convergences'
};
const heards={};
for (const [k,q] of Object.entries(qs)) heards[k]=await searchHeards(q);

const errorTrades=[];
for (const i of heards.errors){
  let body='';
  try { body=((await content(i.id)).envelope?.content?.body)||''; } catch {}
  body=body.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const low=(i.headline+' '+body).toLowerCase();
  let status='review';
  if (low.includes('agreed to unwind')) status='unwound';
  else if (low.includes('trade stands')||low.includes('confirmed the trade stands')) status='stands';
  errorTrades.push({headline:i.headline,time:i.updatedDate,status,body});
}

const out={date,ewindow:{all,offers,trades,lastMinuteOffers},heards,errorTrades};
mkdirSync(root+'/reports/moc-daily',{recursive:true});
writeFileSync(root+`/reports/moc-daily/${date}.raw.json`,JSON.stringify(out,null,2));
console.log(JSON.stringify({
  counts:{all:all.length,offers:offers.length,trades:trades.length,lastMinuteOffers:lastMinuteOffers.length},
  sampleTrades: trades.slice(-10),
  sampleLastMinuteOffers: lastMinuteOffers.slice(-20),
  headlines: Object.fromEntries(Object.entries(heards).map(([k,v])=>[k,v.map(x=>({id:x.id,updatedDate:x.updatedDate,headline:x.headline}))])),
  errorTrades
},null,2));