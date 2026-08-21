const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const creds=JSON.parse(readFileSync('.config/spglobal/credentials.json','utf8'));
const token=creds.access_token;
const appkey='mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN';
const date='2026-04-24';
async function fetchJson(url, headers={}){ const r=await fetch(url,{headers}); const t=await r.text(); if(!r.ok) throw new Error(`${r.status} ${t.slice(0,300)}`); return JSON.parse(t); }
async function ewindow(extraFilter){ let page=1, rows=[]; while(true){ const u=new URL('https://api.platts.com/tradedata/v3/ewindowdata'); u.searchParams.set('filter', `market in ("ASIA Crude Partial") AND order_date>="${date}"${extraFilter}`); u.searchParams.set('pageSize','500'); u.searchParams.set('page', String(page)); u.searchParams.set('sort','order_time:asc'); const d=await fetchJson(u,{Authorization:'Bearer '+token}); rows.push(...(d.results||[])); if(page >= (d.metadata?.total_pages||1)) break; page++; } return rows; }
async function heardSearch(q){ const u=new URL('https://api.platts.com/news-insights/v1/search/heards'); u.searchParams.set('q', q); u.searchParams.set('pageSize','50'); const d=await fetchJson(u,{Authorization:'Bearer '+token,appkey}); return (d.results||[]).filter(x=>(x.updatedDate||'').startsWith(date)).sort((a,b)=>new Date(a.updatedDate)-new Date(b.updatedDate)); }
function cap(s){ return (s||'').toLowerCase().replace(/\b\w/g, c=>c.toUpperCase()); }
function parseDecl(headline){ const m = headline.match(/Platts Crude: (.+?) declares a cargo of (\w+) (.+?) crude to (.+?)(?: following|$)/i); if(!m) return null; return {seller:m[1], month:m[2], grade:m[3], buyer:m[4]}; }
function parseCash(headline){ const m=headline.match(/Cash (Murban|Oman) Heard At \$(\d+(?:\.\d+)?)\/B Over (\w+) Dubai Futures/i); if(!m) return null; return {grade:m[1], value:Number(m[2]), month:m[3]}; }
(async()=>{
 const [offers,trades,decl,deals,murban,oman,bids,offs,errors] = await Promise.all([
   ewindow(' AND order_type="Offer"'),
   ewindow(' AND order_state="consummated"'),
   heardSearch('declares crude'),
   heardSearch('DUBAI PARTIALS'),
   heardSearch('Cash Murban Heard At'),
   heardSearch('Cash Oman Heard At'),
   heardSearch('ME SOUR CRUDE BIDS FINALS ON CLOSE'),
   heardSearch('ME SOUR CRUDE OFFERS FINALS ON CLOSE'),
   heardSearch('executed in error')
 ]);
 const lastMinuteOffers=offers.filter(r => r.order_time >= `${date}T08:29:00` && r.order_time < `${date}T08:30:00`);
 const allDayByCompany={}; for(const r of offers){ const mm=r.market_maker_mnemonic||'?'; (allDayByCompany[mm]??={count:0,min:r.price,max:r.price,last:r.price,name:r.market_maker}).count++; allDayByCompany[mm].min=Math.min(allDayByCompany[mm].min,r.price); allDayByCompany[mm].max=Math.max(allDayByCompany[mm].max,r.price); allDayByCompany[mm].last=r.price; }
 const lastMinByCompany={}; for(const r of lastMinuteOffers){ const mm=r.market_maker_mnemonic||'?'; (lastMinByCompany[mm]??={count:0,min:r.price,last:r.price,name:r.market_maker}).count++; lastMinByCompany[mm].min=Math.min(lastMinByCompany[mm].min,r.price); lastMinByCompany[mm].last=r.price; }
 const parsedDecl=decl.map(d=>({time:d.updatedDate, headline:d.headline, ...parseDecl(d.headline)})).filter(x=>x.seller);
 const declGrouped={}; for(const d of parsedDecl){ const k=`${d.seller}__${d.buyer}__${d.month}__${d.grade}`; (declGrouped[k]??={seller:d.seller,buyer:d.buyer,month:d.month,grade:d.grade,count:0,firstTime:d.time}).count++; }
 const latestDeal=deals[deals.length-1]||null;
 const dealSummary = latestDeal ? (()=>{ const h=latestDeal.headline; const m=h.match(/PART\s+(\d+)\/(\d+):\s*(.+?)\s+SELLS TO\s+(.+?)\*?\s+AT \$(\d+(?:\.\d+)?)\s+FOR\s+(\d+)KB\s+\((\d\d:\d\d:\d\d)\)/i); return m ? {seller:m[3], buyer:m[4], price:Number(m[5]), kb:Number(m[6]), time:m[7], part:m[1], totalParts:m[2], headline:h} : {headline:h}; })() : null;
 const cashMurban=murban.map(x=>({time:x.updatedDate, headline:x.headline, ...parseCash(x.headline)})).filter(x=>x.grade);
 const cashOman=oman.map(x=>({time:x.updatedDate, headline:x.headline, ...parseCash(x.headline)})).filter(x=>x.grade);
 const archive={ date, fluxOfficials:{ assessment:null, premium:null, text:null }, declarations:parsedDecl, cashMurban, cashOman, errorTrades:errors.map(x=>({headline:x.headline,time:x.updatedDate})), finalsOnClose:{ bids:bids.map(x=>x.headline), offers:offs.map(x=>x.headline) }, ewindow:{ trades:trades.map(r=>({seller:r.seller_mnemonic||r.market_maker_mnemonic,buyer:r.buyer_mnemonic||r.counterparty_mnemonic,price:r.price,quantity:r.order_quantity,time:r.order_time})), offersLastMinute:lastMinuteOffers.map(r=>({company:r.market_maker_mnemonic,price:r.price,time:r.order_time})), offersAllDayStats:allDayByCompany }, heards:{ deals:deals.map(x=>({headline:x.headline,time:x.updatedDate,id:x.id})), bids:bids.map(x=>({headline:x.headline,time:x.updatedDate,id:x.id})), offers:offs.map(x=>({headline:x.headline,time:x.updatedDate,id:x.id})) } };
 mkdirSync('reports/moc-daily',{recursive:true});
 writeFileSync(`reports/moc-daily/${date}.json`, JSON.stringify(archive,null,2));
 console.log(JSON.stringify({ date, trades:archive.ewindow.trades, dealSummary, lastMinByCompany, allDayByCompany, parsedDecl, declGrouped:Object.values(declGrouped), cashMurban, cashOman, bids:bids.map(x=>x.headline), offers:offs.map(x=>x.headline) }, null, 2));
})();