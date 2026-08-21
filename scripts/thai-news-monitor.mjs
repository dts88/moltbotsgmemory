#!/usr/bin/env node
/**
 * Thai News Monitor
 * Fetches RSS/API from 5 Thai English-language news sites,
 * filters by keywords, deduplicates via seen-IDs cache,
 * and returns either raw JSON matches or delivery-ready text.
 *
 * Usage:
 *   node thai-news-monitor.mjs             # raw JSON matches, no cache update
 *   node thai-news-monitor.mjs --delivery  # delivery-ready text, updates cache
 *   node thai-news-monitor.mjs --send      # legacy direct Telegram send
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';

const CACHE_PATH = '/home/node/clawd/.config/thai-news-monitor/seen.json';
const CONFIG_PATH = '/home/node/clawd/.config/thai-news-monitor/config.json';

// ── Default config (overridable via config.json) ─────────────────────────────
const DEFAULT_CONFIG = {
  keywords: [
    // Companies
    'AIS', 'Advanced Info Service', 'ADVANC',
    'Gulf Energy', 'Gulf Development', 'GULF',
    'True Corp', 'True Corporation', 'True Move',
    // Macro economy (precise terms, not bare "baht")
    'GDP', 'inflation', 'Bank of Thailand', 'BOT rate', 'interest rate',
    'fiscal policy', 'government budget', 'trade balance', 'FDI',
    'foreign investment', 'current account', 'Thai economy',
    'economic growth', 'economic outlook', 'monetary policy',
    // Telecom / digital
    'telecom', 'telecommunications', 'mobile network', '5G', 'spectrum',
    'digital economy', 'broadband',
    // Markets
    'SET index', 'stock exchange of thailand', 'Thai stocks',
    'Thai baht exchange', 'baht depreciation', 'baht appreciation',
    // Trade & logistics
    'shipping', 'aviation', 'supply chain', 'logistics',
    'export', 'import', 'freight', 'port', 'cargo',
    'trade route', 'safeguard', 'tariff',
    // Politics - elections & leadership
    'election', 'general election', 'by-election',
    'prime minister', 'cabinet', 'parliament', 'senate',
    'Anutin', 'Paetongtarn', 'Thaksin', 'Pheu Thai',
    'Move Forward', 'People\'s Party', 'Democrat Party',
    'dissolution', 'no-confidence', 'vote of no confidence',
    'constitution', 'constitutional court', 'NACC',
    'Thai PM', 'Thai government', 'Thai politics',
  ],
  // Articles matching ANY of these will be excluded (social/crime/lifestyle noise)
  excludeKeywords: [
    'scam', 'arrested', 'police', 'murder', 'stabbed', 'tourist dies',
    'drunk', 'alcohol', 'accident', 'crash', 'fire', 'flood',
    'romance scam', 'fraud victim', 'drug', 'smuggling', 'theft',
    'temple', 'visa', 'expat', 'weather', 'heat wave', 'heat index',
    'pollution', 'air quality', 'wildfire', 'haze', 'smoke',
    'sport', 'football', 'soccer', 'basketball', 'golf',
    'melon', 'fruit', 'food', 'recipe', 'restaurant',
    'tourist', 'tourism', 'travel', 'hotel', 'songkran festival',
    'dies', 'death', 'dead', 'body found', 'missing',
    'shouts', 'horn',
  ],
  sources: [
    {
      name: 'Bangkok Post',
      type: 'rss',
      urls: [
        'https://www.bangkokpost.com/rss/data/topstories.xml',
        'https://www.bangkokpost.com/rss/data/business.xml',
      ],
    },
    {
      name: 'The Thaiger',
      type: 'rss',
      urls: ['https://thethaiger.com/feed'],
    },
    {
      name: 'Thai PBS World',
      type: 'rss',
      urls: ['https://world.thaipbs.or.th/feed'],
    },
    {
      name: 'Nation Thailand',
      type: 'nation_api',
      urls: ['https://api.nationthailand.com/v1.0/categories/news?per_page=30&page=1'],
    },
    {
      name: 'Khaosod English',
      type: 'html',
      urls: ['https://www.khaosodenglish.com/'],
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadCache() {
  try {
    if (existsSync(CACHE_PATH)) {
      return new Set(JSON.parse(readFileSync(CACHE_PATH, 'utf8')));
    }
  } catch {}
  return new Set();
}

function saveCache(seen) {
  const dir = CACHE_PATH.replace(/\/[^/]+$/, '');
  try { require('fs').mkdirSync(dir, { recursive: true }); } catch {}
  // Keep last 2000 IDs to avoid unbounded growth
  const arr = [...seen].slice(-2000);
  writeFileSync(CACHE_PATH, JSON.stringify(arr));
}

function makeId(url) {
  return createHash('md5').update(url).digest('hex').slice(0, 12);
}

function matchesKeywords(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

function matchesExclude(text, excludeKeywords) {
  if (!excludeKeywords || excludeKeywords.length === 0) return false;
  const lower = text.toLowerCase();
  return excludeKeywords.some(kw => lower.includes(kw.toLowerCase()));
}

function decodeHtmlEntities(text = '') {
  return text
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function cleanText(text = '') {
  return decodeHtmlEntities(text)
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function isUsefulArticleParagraph(text = '') {
  const t = cleanText(text);
  if (t.length < 80) return false;
  if (/^(writer|reporter|photo|caption|image|source|related|read more|advertisement)\b/i.test(t)) return false;
  if (/^one of\s*$/i.test(t)) return false;
  if (/^\s*•/.test(t)) return false;
  if (/all rights reserved|bangkok post public company|subscribe|newsletter/i.test(t)) return false;
  return true;
}

function deliverySentences(text = '', maxChars = 320) {
  const t = cleanText(text);
  if (!t) return '';
  // Keep only complete sentences where possible; avoid mid-sentence "..." truncation.
  const sentenceRe = /[^.!?。！？]+[.!?。！？](?:["'”’])?/g;
  const sentences = t.match(sentenceRe)?.map(s => cleanText(s)) ?? [];
  if (sentences.length === 0) return t.length <= maxChars ? t : '';

  let out = '';
  for (const s of sentences) {
    if (!out) {
      out = s;
    } else if ((out + ' ' + s).length <= maxChars) {
      out += ' ' + s;
    } else {
      break;
    }
  }
  return out || sentences[0];
}

// ── Fetchers ──────────────────────────────────────────────────────────────────
async function fetchRSS(url, sourceName) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 ThaiBotMonitor/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();

  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const title = cleanText((/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(block) ||
                   /<title>(.*?)<\/title>/.exec(block))?.[1] ?? '');
    const link  = cleanText((/<link>(.*?)<\/link>/.exec(block) ||
                   /<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/.exec(block))?.[1] ?? '');
    const desc  = cleanText((/<description><!\[CDATA\[(.*?)\]\]><\/description>/s.exec(block) ||
                   /<description>(.*?)<\/description>/s.exec(block))?.[1]
                   ?.replace(/<[^>]+>/g, '') ?? '').slice(0, 300);
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/.exec(block))?.[1]?.trim() ?? '';

    if (title && link) {
      items.push({ title, url: link, summary: desc, source: sourceName, publishedAt: pubDate });
    }
  }
  return items;
}

async function fetchNationAPI(url, sourceName) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 ThaiBotMonitor/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const articles = data?.data?.data ?? data?.articles ?? [];

  return articles.map(a => ({
    title: cleanText(a.title ?? ''),
    url: `https://www.nationthailand.com${a.link ?? ''}`,
    summary: cleanText(a.blurb ?? ''),
    source: sourceName,
    publishedAt: a.published_at ?? '',
  }));
}

async function fetchKhaoSodHTML(url, sourceName) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
      'Accept': 'text/html',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const items = [];
  // Match article links with titles
  const linkRe = /href="(https:\/\/www\.khaosodenglish\.com\/[^"]+)"[^>]*>([^<]{10,200})<\/a>/g;
  const seen = new Set();
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const link = m[1];
    const title = cleanText(m[2]);
    if (!seen.has(link) && title.length > 15 && !/category|tag|page|author/i.test(link)) {
      seen.add(link);
      items.push({ title, url: link, summary: '', source: sourceName, publishedAt: '' });
    }
  }
  return items.slice(0, 30);
}

// ── Telegram Sender ───────────────────────────────────────────────────────────
async function sendToTelegram(text) {
  const creds = JSON.parse(readFileSync('/home/node/clawd/.config/telegram/credentials.json', 'utf8'));
  const botToken = creds.botToken;
  const chatId = '-1003526235110';
  const threadId = 7;

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: threadId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram error: ${JSON.stringify(data)}`);
}

function toSGT(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const sgt = new Date(d.getTime() + 8 * 3600 * 1000);
  return sgt.toISOString().slice(0, 16).replace('T', ' ') + ' SGT';
}

async function buildMessageChunks(matched) {
  const lines = [];
  for (let i = 0; i < matched.length; i++) {
    const a = matched[i];
    const ts = toSGT(a.publishedAt);

    let bullets = [];
    try {
      const res = await fetch(a.url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();
      const paras = [];
      const pRe = /<p[^>]*>([\s\S]*?)<\/p>/g;
      let m;
      while ((m = pRe.exec(html)) !== null) {
        const txt = cleanText(m[1].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ''));
        if (isUsefulArticleParagraph(txt)) paras.push(txt);
      }
      bullets = paras
        .map(p => deliverySentences(p))
        .filter(Boolean)
        .slice(0, 4);
    } catch {
      bullets = [a.summary || a.title];
    }

    if (bullets.length === 0) bullets = [a.summary || a.title];

    const block = [
      `[${i + 1}] ${a.title}`,
      ts,
      ...bullets.map(b => `• ${b}`),
      a.url,
    ].join('\n');
    lines.push(block);
  }

  const chunks = [];
  let current = '';
  for (const block of lines) {
    if ((current + '\n\n' + block).length > 3800 && current) {
      chunks.push(current.trim());
      current = block;
    } else {
      current = current ? current + '\n\n' + block : block;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const sendMode = process.argv.includes('--send');
  const deliveryMode = process.argv.includes('--delivery') || process.argv.includes('--prepare-delivery');
  const ignoreSeen = process.argv.includes('--ignore-seen');
  const noCacheUpdate = process.argv.includes('--no-cache-update');
  const excludeIndicesArg = process.argv.find(a => a.startsWith('--exclude-indices='));
  const excludeIndices = new Set(
    (excludeIndicesArg?.split('=')[1] ?? '')
      .split(',')
      .map(n => Number(n.trim()))
      .filter(n => Number.isInteger(n) && n > 0)
  );
  // Load config (allow override)
  let config = DEFAULT_CONFIG;
  if (existsSync(CONFIG_PATH)) {
    try { config = { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) }; }
    catch {}
  }

  // Ensure cache dir
  mkdirSync(CACHE_PATH.replace(/\/[^/]+$/, ''), { recursive: true });

  const seen = ignoreSeen ? new Set() : loadCache();
  const matched = [];

  for (const src of config.sources) {
    for (const url of src.urls) {
      let items = [];
      try {
        if (src.type === 'rss') items = await fetchRSS(url, src.name);
        else if (src.type === 'nation_api') items = await fetchNationAPI(url, src.name);
        else if (src.type === 'html') items = await fetchKhaoSodHTML(url, src.name);
      } catch (e) {
        process.stderr.write(`[${src.name}] fetch error: ${e.message}\n`);
        continue;
      }

      // Only consider articles from the last 6 hours (covers 2h interval with buffer)
      const cutoffMs = Date.now() - 6 * 60 * 60 * 1000;

      for (const item of items) {
        // Time filter: skip old articles
        if (item.publishedAt) {
          const pubMs = new Date(item.publishedAt).getTime();
          if (!isNaN(pubMs) && pubMs < cutoffMs) continue;
        }

        const id = makeId(item.url);
        if (seen.has(id)) continue;

        const text = `${item.title} ${item.summary}`;
        // Must match at least one keyword AND not match any exclude keyword
        if (matchesKeywords(text, config.keywords) && !matchesExclude(text, config.excludeKeywords)) {
          seen.add(id); // Only mark as seen if matched (to be sent)
          matched.push({ ...item, id });
        }
        // Non-matching articles are NOT marked seen, so keyword changes take effect next run
      }
    }
  }

  if (!sendMode && !deliveryMode) {
    // Test mode: just output JSON, do NOT update cache
    process.stdout.write(JSON.stringify(matched, null, 2) + '\n');
    return;
  }

  const deliverMatched = excludeIndices.size > 0
    ? matched.filter((_, i) => !excludeIndices.has(i + 1))
    : matched;

  // Delivery/send mode: save cache (mark matched articles as seen), unless this is a manual preview/rerun.
  if (!noCacheUpdate) saveCache(seen);

  matched.length = 0;
  matched.push(...deliverMatched);

  if (matched.length === 0) {
    const now = new Date();
    const ts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Singapore',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    }).format(now).replace(' ', ' ');
    const emptyMessage = `📭 ${ts} SGT — 暂无匹配新闻`;

    if (deliveryMode) {
      process.stdout.write(`${emptyMessage}\n`);
      return;
    }

    await sendToTelegram(emptyMessage);
    process.stderr.write('No new articles. Sent brief notification.\n');
    return;
  }

  const chunks = await buildMessageChunks(matched);

  if (deliveryMode) {
    process.stdout.write(chunks.join('\n\n---\n\n') + '\n');
    return;
  }

  for (const chunk of chunks) {
    await sendToTelegram(chunk);
  }

  process.stderr.write(`Sent ${matched.length} articles in ${chunks.length} message(s).\n`);
}

main().catch(e => {
  process.stderr.write(`Fatal: ${e.message}\n`);
  process.exit(1);
});
