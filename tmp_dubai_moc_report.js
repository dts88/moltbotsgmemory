import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const date = '2026-04-30';
const creds = JSON.parse(readFileSync('.config/spglobal/credentials.json', 'utf8'));
const token = creds.access_token;
const appkey = 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN';

async function jfetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text, _status: res.status };
  }
}

async function getHeards(q) {
  const url = 'https://api.platts.com/news-insights/v1/search/heards?pageSize=50&q=' + encodeURIComponent(q);
  const data = await jfetch(url, { headers: { Authorization: 'Bearer ' + token } });
  return (data.results || []).filter(i => (i.updatedDate || '').startsWith(date)).sort((a, b) => new Date(a.updatedDate) - new Date(b.updatedDate));
}

async function getContent(id) {
  return await jfetch('https://api.platts.com/news-insights/v1/content/' + id, {
    headers: { Authorization: 'Bearer ' + token, appkey }
  });
}

async function fetchEwindow(extraFilter) {
  let page = 1, rows = [];
  while (true) {
    const url = new URL('https://api.platts.com/tradedata/v3/ewindowdata');
    url.searchParams.set('filter', `market in ("ASIA Crude Partial") AND order_date>="${date}"${extraFilter}`);
    url.searchParams.set('pageSize', '500');
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', 'order_time:asc');
    const d = await jfetch(url, { headers: { Authorization: 'Bearer ' + token } });
    rows.push(...(d.results || []));
    if (page >= (d.metadata?.total_pages || 1)) break;
    page++;
  }
  return rows;
}

async function getFluxRaw() {
  try {
    return await jfetch('https://syndication.twitterapiv2.com/user_tweets?username=FluxOfficials&count=8');
  } catch (e) {
    return { error: String(e) };
  }
}

const [declares, deals, murban, oman, focBids, focOffers, fluxRaw, offers, trades] = await Promise.all([
  getHeards('declares crude'),
  getHeards('DUBAI PARTIALS'),
  getHeards('Cash Murban Heard At'),
  getHeards('Cash Oman Heard At'),
  getHeards('ME SOUR CRUDE BIDS: FINALS ON CLOSE'),
  getHeards('ME SOUR CRUDE OFFERS: FINALS ON CLOSE'),
  getFluxRaw(),
  fetchEwindow(' AND order_type="Offer"'),
  fetchEwindow(' AND order_state="consummated"')
]);

const errorCandidates = [...deals, ...declares, ...murban, ...oman, ...focBids, ...focOffers].filter(x => /executed in error|agreed to unwind|trade stands|being informed/i.test((x.headline || '') + ' ' + (x.summary || '')));
const errorDetails = [];
for (const item of errorCandidates) {
  const id = item.id || item.articleId || item.guid;
  if (!id) continue;
  const c = await getContent(id);
  errorDetails.push({ id, headline: item.headline, updatedDate: item.updatedDate, content: c });
}

const archive = { date, fluxRaw, heards: { declares, deals, murban, oman, focBids, focOffers }, ewindow: { offers, trades }, errorDetails };
mkdirSync('reports/moc-daily', { recursive: true });
writeFileSync(`reports/moc-daily/${date}.json`, JSON.stringify(archive, null, 2));

const summary = {
  date,
  counts: {
    declares: declares.length,
    deals: deals.length,
    murban: murban.length,
    oman: oman.length,
    focBids: focBids.length,
    focOffers: focOffers.length,
    offers: offers.length,
    trades: trades.length,
    flux: Array.isArray(fluxRaw?.data) ? fluxRaw.data.length : null,
    errorDetails: errorDetails.length
  },
  latestDeal: deals.at(-1)?.headline || null,
  latestBid: focBids.at(-1)?.headline || null,
  latestOffer: focOffers.at(-1)?.headline || null,
  fluxSample: Array.isArray(fluxRaw?.data) ? fluxRaw.data.slice(0, 5).map(t => t.text || t.full_text || t.tweet_text || '') : fluxRaw
};
console.log(JSON.stringify(summary, null, 2));