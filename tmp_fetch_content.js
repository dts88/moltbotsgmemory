const { readFileSync } = require('fs');
const creds = JSON.parse(readFileSync('.config/spglobal/credentials.json','utf8'));
const token = creds.access_token;
const appkey = 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN';
const ids = process.argv.slice(2);
(async()=>{
 for (const id of ids) {
  const d = await fetch('https://api.platts.com/news-insights/v1/content/'+id,{headers:{Authorization:'Bearer '+token, appkey}}).then(r=>r.json());
  const body = (d?.envelope?.content?.body||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  console.log('\nID',id,'\n',body.slice(0,4000),'\n');
 }
})();