#!/usr/bin/env node
/**
 * Platts Monitor v7
 * - 多端点 Token 刷新（Platts官方 + Okta）
 * - Heards: geography filter (Asia/Middle East/Global) + 关键词分类
 * - Story: sector filter (Crude Oil Plus/Fuels and Refining Plus/LNG Plus/Shipping Plus)
 * - Top News: 无 commodity filter，仅时间过滤
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { trackUsage } from './usage-tracker.mjs';
import { ensureValidPlattsConfig } from './platts-auth.mjs';

const userArg = process.argv.find(a => a.startsWith('--user='));
const TRACK_USER = userArg ? userArg.split('=')[1] : 'system';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CONFIG_FILE = join(WORKSPACE, '.config/spglobal/credentials.json');
const STATE_FILE = join(WORKSPACE, '.platts-monitor-state.json');
const FILTERS_FILE = join(WORKSPACE, '.config/platts-monitor-filters.json');

const API_BASE = 'https://api.platts.com';
const CI_API_BASE = 'https://api.ci.spglobal.com';

// Client ID from SPGlobal (extracted from JWT)
const CLIENT_ID = 'PL_API_PLATFORM';

// Token refresh endpoints (try in order - working method first)
const REFRESH_ENDPOINTS = [
  {
    name: 'Platts Auth Token (no client_id)',
    url: `${API_BASE}/auth/api/token`,
    method: 'form',
    buildBody: (refreshToken) => new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  },
  {
    name: 'Okta OAuth2 (no client_id)',
    url: 'https://secure.signin.spglobal.com/oauth2/spglobal/v1/token',
    method: 'form',
    buildBody: (refreshToken) => new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  },
  {
    name: 'Platts Auth API (JSON)',
    url: `${API_BASE}/auth/api/refresh`,
    method: 'json',
    buildBody: (refreshToken) => JSON.stringify({ refresh_token: refreshToken }),
    headers: { 'Content-Type': 'application/json' }
  }
];

// Heards API geography filter (server-side, eliminates NWE/Europe noise)
const HEARDS_GEO_FILTER = encodeURIComponent(
  'geography:"Asia" OR geography:"Middle East" OR geography:"Global" OR ' +
  'geography:"Singapore" OR geography:"Fujairah" OR geography:"China" OR ' +
  'geography:"India" OR geography:"Strait of Hormuz" OR geography:"Persian Gulf" OR ' +
  'geography:"Gulf Cooperation Council (GCC)" OR geography:"Dubai" OR ' +
  'geography:"South Korea" OR geography:"Japan" OR geography:"Oman"'
);

// Heards keyword patterns for categorization
const HEARDS_PATTERNS = {
  crude: ['crude', 'dubai', 'murban', 'oman', 'brent', 'espo', 'basrah', 'urals', 'wti', 'upper zakum'],
  products: ['gasoline', 'gasoil', 'diesel', 'jet', 'kerosene', 'naphtha', 'mogas', '92 ron', '95 ron', '97 ron'],
  fuelOil: ['fuel oil', 'bunker', 'vlsfo', 'hsfo', 'mgo', 'lsfo', '380 cst', '180 cst', 'mf 0.5', 'marine fuel'],
  lng: ['lng', 'liquefied natural gas', 'jkm', 'des nwe', 'des japan'],
};

const HEARD_OUTPUT_CATEGORIES = new Set(['crude']);

// Story API sector filter (server-side, replaces client-side STORY_KEYWORDS matching)
const STORY_SECTOR_FILTER = encodeURIComponent(
  'sector:"Crude Oil Plus" OR sector:"Crude" OR ' +
  'sector:"Fuels and Refining Plus" OR sector:"Refined Products" OR ' +
  'sector:"LNG Plus" OR sector:"LNG" OR ' +
  'sector:"Shipping Plus" OR sector:"Shipping"'
);

const STORY_SECTOR_FILTER_RAW =
  'sector:"Crude Oil Plus" OR sector:"Crude" OR ' +
  'sector:"Fuels and Refining Plus" OR sector:"Refined Products" OR ' +
  'sector:"LNG Plus" OR sector:"LNG" OR ' +
  'sector:"Shipping Plus" OR sector:"Shipping"';

// Story keywords (kept as secondary filter, primary filter is server-side sector)
const STORY_KEYWORDS = [
  'crude', 'dubai', 'murban', 'wti', 'brent', 'oman', 'upper zakum', 'basrah', 'espo',
  'gasoline', 'gasoil', 'diesel', 'jet', 'kerosene', 'naphtha', 'mops',
  '92 ron', '95 ron', '97 ron', 'mogas',
  'fuel oil', 'bunker', 'vlsfo', 'hsfo', 'mgo', 'lsfo', '380 cst', '180 cst', 'mf 0.5',
  'lng', 'liquefied natural gas', 'jkm',
  'strait of hormuz', 'iran', 'middle east', 'opec', 'saudi', 'aramco',
];

const MUST_HAVE_PATTERNS = ['crude moc'];
const SKIP_HEADLINE_PATTERNS = ['Daily Rationale & Exclusions', 'Rationale & Exclusions', 'Rationales & Exclusions', 'Weekly Rationale'];
const EXCLUDED_COMMODITIES = ['acrylonitrile', 'acn', 'epoxy', 'styrene', 'mtbe', 'ethanolamine', 'pvc', 'polyethylene', 'polypropylene', 'hdpe', 'ldpe', 'benzene', 'toluene', 'xylene', 'methanol', 'ethanol', 'acetone', 'phenol', 'ammonia', 'urea', 'sulfur'];

// Heards headline exclusion patterns (chemicals/materials that slip through geography filter)
const EXCLUDED_HEARDS_PATTERNS = [
  'eva:', 'ethylene', 'propylene', 'polypropylene', 'polystyrene', 'polyethylene',
  'paraxylene', 'styrene', 'acrylonitrile', 'caprolactam', 'phenol', 'acetone',
  'methanol', 'ethanol', 'mtbe', 'benzene', 'toluene', 'xylene', 'mixed xylene',
  'ammonia', 'urea', 'dap', 'phosphate', 'sulfur', 'caustic soda', 'chlorine',
  'compliance carbon', 'carbon:', 'nzu ', 'cee', 'cgo', 'renewable',
  'petrochemical', 'petchem', 'polymers', 'polymer', 'raffia', 'injection',
  'hdpe', 'ldpe', 'lldpe', 'pp ', 'pvc', 'pet', 'abs ',
  'base oils', 'bitumen', 'lubricant', 'wax', 'asphalt',
  'coal', 'steel', 'iron ore', 'aluminum', 'copper', 'nickel',
  'ethylene glycol', 'ethylene oxide', 'propylene oxide', 'ethylene dichloride',
  'methyl methacrylate', 'mdi', 'tdi', 'polyol', 'polyether',
  'acetic acid', 'butadiene', 'butyl acrylate', '2-ethylhexyl', 'oxo-alcohol',
  'isomer', 'mx ', 'ox ', 'px ', 'sm ', 'eb ', 'bdo ',
  'e-window administered', 'platts asia high eva', 'platts asia medium eva',
  'platts asia low eva', 'platts asia hdpe', 'platts asia ldpe', 'platts asia lldpe',
  'platts asia pp', 'platts asia pet', 'platts asia ps', 'platts asia abs',
];

const DEFAULT_MONITOR_FILTERS = {
  // Title-only rules run before fetching article content, saving API calls and downstream tokens.
  titleStartsWith: ['ASIA CRUDE DEALS SUMMARY'],
  titleIncludes: [],
  titleRegex: [],
  // Content rules run after fetching content, for noisy templates that cannot be identified by title alone.
  contentIncludes: []
};

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
  // If the file is just a raw token string, wrap it in a valid JSON structure
  try {
    const content = readFileSync(CONFIG_FILE, 'utf8').trim();
    if (content.startsWith('ey')) { // Likely a JWT
      return {
        access_token: content,
        token_type: 'Bearer'
      };
    }
  } catch (innerE) {}
    throw e;
  }
}

function saveConfig(config) {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadMonitorFilters() {
  let userFilters = {};
  if (existsSync(FILTERS_FILE)) {
    try {
      userFilters = JSON.parse(readFileSync(FILTERS_FILE, 'utf8'));
    } catch (e) {
      console.error(`[Platts] Failed to parse ${FILTERS_FILE}, using defaults: ${e.message}`);
    }
  }

  return {
    titleStartsWith: [...DEFAULT_MONITOR_FILTERS.titleStartsWith, ...(userFilters.titleStartsWith || [])],
    titleIncludes: [...DEFAULT_MONITOR_FILTERS.titleIncludes, ...(userFilters.titleIncludes || [])],
    titleRegex: [...DEFAULT_MONITOR_FILTERS.titleRegex, ...(userFilters.titleRegex || [])],
    contentIncludes: [...DEFAULT_MONITOR_FILTERS.contentIncludes, ...(userFilters.contentIncludes || [])]
  };
}

const MONITOR_FILTERS = loadMonitorFilters();

function normalizeText(text) {
  return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchesAnyRegex(text, patterns) {
  return patterns.some(pattern => {
    try {
      return new RegExp(pattern, 'i').test(text || '');
    } catch (e) {
      console.error(`[Platts] Invalid monitor filter regex ignored: ${pattern}`);
      return false;
    }
  });
}

function isTitleBlockedByMonitorFilters(headline) {
  const title = normalizeText(headline);
  if (!title) return false;
  if (MONITOR_FILTERS.titleStartsWith.some(p => title.startsWith(normalizeText(p)))) return true;
  if (MONITOR_FILTERS.titleIncludes.some(p => title.includes(normalizeText(p)))) return true;
  if (matchesAnyRegex(headline || '', MONITOR_FILTERS.titleRegex)) return true;
  return false;
}

function isContentBlockedByMonitorFilters(body) {
  const text = normalizeText(stripHtml(body || ''));
  if (!text) return false;
  return MONITOR_FILTERS.contentIncludes.some(p => text.includes(normalizeText(p)));
}

// Calculate token expiration
function getTokenExpiry(config) {
  if (config.expires_at) {
    return new Date(config.expires_at).getTime();
  }
  if (config.token_updated_at) {
    const updatedAt = new Date(config.token_updated_at).getTime();
    const expiresIn = (config.expires_in || 3600) * 1000;
    return updatedAt + expiresIn;
  }
  return 0;
}

// Check if token needs refresh (less than 10 minutes remaining or expired)
function tokenNeedsRefresh(config) {
  const expiresAt = getTokenExpiry(config);
  const remaining = expiresAt - Date.now();
  const mins = Math.round(remaining / 60000);
  console.error(`[Platts] Token expires in ${mins} minutes`);
  return remaining < 10 * 60 * 1000;
}

// Check if token is completely expired
function isTokenExpired(config) {
  const expiresAt = getTokenExpiry(config);
  return Date.now() > expiresAt;
}

// Try multiple refresh endpoints
async function refreshAccessToken(config) {
  console.error('[Platts] Attempting token refresh...');
  
  const refreshToken = config.refresh_token;
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const errors = [];
  
  for (const endpoint of REFRESH_ENDPOINTS) {
    console.error(`[Platts] Trying ${endpoint.name}...`);
    
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: endpoint.headers,
        body: endpoint.buildBody(refreshToken)
      });
      
      if (!response.ok) {
        const text = await response.text();
        errors.push(`${endpoint.name}: ${response.status} - ${text.substring(0, 100)}`);
        console.error(`[Platts] ${endpoint.name} failed: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (!data.access_token) {
        errors.push(`${endpoint.name}: No access_token in response`);
        continue;
      }
      
      // Success! Update config
      const now = Date.now();
      const expiresIn = data.expires_in || 3600;
      
      // Track refresh_token age: if API returned a new one, reset the clock
      const newRefreshToken = data.refresh_token || refreshToken;
      const refreshTokenChanged = data.refresh_token && data.refresh_token !== refreshToken;
      const refreshTokenObtainedAt = refreshTokenChanged
        ? new Date(now).toISOString()
        : (config.refresh_token_obtained_at || new Date(now).toISOString());

      const newConfig = {
        token_type: data.token_type || 'Bearer',
        access_token: data.access_token,
        refresh_token: newRefreshToken,
        refresh_token_obtained_at: refreshTokenObtainedAt,
        expires_in: expiresIn,
        expires_at: new Date(now + expiresIn * 1000).toISOString(),
        token_updated_at: new Date(now).toISOString(),
        refresh_method: endpoint.name
      };
      
      saveConfig(newConfig);
      console.error(`[Platts] Token refreshed via ${endpoint.name}!`);
      
      return newConfig;
    } catch (e) {
      errors.push(`${endpoint.name}: ${e.message}`);
      console.error(`[Platts] ${endpoint.name} error: ${e.message}`);
    }
  }
  
  // All methods failed
  const error = new Error('All refresh methods failed');
  error.details = errors;
  throw error;
}

function loadState() {
  const defaults = { lastCheckTime: null, seenHeardIds: [], seenStoryIds: [], seenTopNewsIds: [] };
  if (existsSync(STATE_FILE)) {
    try {
      const existing = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      // Merge defaults for any missing keys (backward compat)
      return Object.assign({}, defaults, existing);
    } catch (e) {
      console.error('[Platts] State file corrupted, resetting:', e.message);
    }
  }
  return defaults;
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function categorizeHeards(headline) {
  const h = (headline || '').toLowerCase();
  for (const [category, patterns] of Object.entries(HEARDS_PATTERNS)) {
    if (patterns.some(p => h.includes(p))) return category;
  }
  return null;
}

function isStoryRelevant(item, hours = 2) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  if (new Date(item.updatedDate) < since) return false;
  if (isTitleBlockedByMonitorFilters(item.headline)) return false;
  const headline = (item.headline || '').toLowerCase();
  if (MUST_HAVE_PATTERNS.some(p => headline.includes(p))) return true;
  if (SKIP_HEADLINE_PATTERNS.some(p => headline.includes(p.toLowerCase()))) return false;
  return STORY_KEYWORDS.some(kw => headline.includes(kw.toLowerCase()));
}

function isCommodityAllowed(commodities) {
  if (!commodities || commodities.length === 0) return true;
  const str = commodities.join(' ').toLowerCase();
  return !EXCLUDED_COMMODITIES.some(ex => str.includes(ex));
}

function toApiTimestamp(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function buildUpdatedDateFilter(hours) {
  const since = toApiTimestamp(new Date(Date.now() - hours * 60 * 60 * 1000));
  const until = toApiTimestamp(new Date());
  return `updateddate>="${since}" AND updateddate<="${until}"`;
}

async function fetchAllHeards(token, maxPages = 5, hours = 2) {
  const allHeards = { crude: [], products: [], fuelOil: [], lng: [] };
  const filter = encodeURIComponent(`${buildUpdatedDateFilter(hours)} AND (${decodeURIComponent(HEARDS_GEO_FILTER)})`);
  
  for (let page = 1; page <= maxPages; page++) {
    const url = `${CI_API_BASE}/news-insights/v1/search/heards?filter=${filter}&pageSize=100&page=${page}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      if (response.status === 401) throw new Error('TOKEN_EXPIRED');
      break;
    }
    
    const data = await response.json();
    if (!data.results || data.results.length === 0) break;
    
    for (const item of data.results) {
      const headline = (item.headline || '').toLowerCase();
      if (isTitleBlockedByMonitorFilters(item.headline)) continue;
      if (EXCLUDED_HEARDS_PATTERNS.some(p => headline.includes(p))) continue;
      const category = categorizeHeards(item.headline);
      if (category && allHeards[category]) {
        allHeards[category].push(item);
      }
    }
  }
  
  return allHeards;
}

async function fetchStories(token, hours = 2) {
  const filter = encodeURIComponent(`contentType:"News" AND ${buildUpdatedDateFilter(hours)} AND (${STORY_SECTOR_FILTER_RAW})`);
  const url = `${CI_API_BASE}/news-insights/v1/search/story/latest-news?filter=${filter}&field=body,sector,commodity,geography&pageSize=50`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('TOKEN_EXPIRED');
    throw new Error(`Story API Error: ${response.status}`);
  }
  return response.json();
}

async function fetchTopNews(token) {
  const url = `${CI_API_BASE}/news-insights/v1/search/story/top-news?field=body,sector,commodity,geography&pageSize=50`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('TOKEN_EXPIRED');
    console.error(`[Platts] Top News API Error: ${response.status}`);
    return { results: [] };
  }
  return response.json();
}

async function fetchContent(token, id) {
  const url = `${API_BASE}/news-insights/v1/content/${id}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.envelope;
}

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRecapNoTrades(headline, body) {
  const h = (headline || '').toLowerCase();
  const text = stripHtml(body || '').toLowerCase();
  const isDealsSummaryRecap = h.includes('deals summary') && h.includes('recap');
  const hasNoTrades = h.includes('no trades') || text.includes('no trades reported') || text.includes('trades: none');
  return isDealsSummaryRecap && hasNoTrades;
}

function isBunkerEmptySummary(headline, body) {
  const h = (headline || '').toLowerCase();
  const text = stripHtml(body || '').toLowerCase();
  const isBunkerSummary = h.includes('bunker') && h.includes('bids, offers, trades');
  const noBids = text.includes('bids: none') || text.includes('no bids reported');
  const noOffers = text.includes('offers: none') || text.includes('no offers reported');
  const noTrades = text.includes('trades: none') || text.includes('no trades reported');
  return isBunkerSummary && noBids && noOffers && noTrades;
}

function hasMeaningfulContent(headline, body) {
  if (!body) return false;
  const text = stripHtml(body);
  const skipPatterns = ['No bids/offers/trades', 'No trades reported'];
  if (isTitleBlockedByMonitorFilters(headline) || isContentBlockedByMonitorFilters(body)) return false;
  if (isRecapNoTrades(headline, body) || isBunkerEmptySummary(headline, body)) return false;
  return !skipPatterns.some(p => text.includes(p)) && text.length > 50;
}

function filterByTime(items, hours) {
  const since = Date.now() - hours * 60 * 60 * 1000;
  return items.filter(item => new Date(item.updatedDate).getTime() > since);
}

async function main() {
  let config = loadConfig();
  const state = loadState();
  
  console.error('[Platts] Starting v7 (refresh_token age tracking)...');
  
  // Check refresh_token age and warn if approaching expiry (~24h lifetime)
  const REFRESH_TOKEN_WARN_HOURS = 20;
  const REFRESH_TOKEN_MAX_HOURS = 24;
  if (config.refresh_token_obtained_at) {
    const ageMs = Date.now() - new Date(config.refresh_token_obtained_at).getTime();
    const ageHours = ageMs / 3600000;
    console.error(`[Platts] refresh_token age: ${ageHours.toFixed(1)}h (obtained: ${config.refresh_token_obtained_at})`);
    
    if (ageHours >= REFRESH_TOKEN_MAX_HOURS) {
      console.log(JSON.stringify({
        status: 'REFRESH_TOKEN_EXPIRED',
        refresh_token_age_hours: Math.round(ageHours),
        warning: `⚠️ Platts refresh_token 已超过 ${REFRESH_TOKEN_MAX_HOURS} 小时，很可能已失效。请手动重新登录获取新 token。`
      }));
    } else if (ageHours >= REFRESH_TOKEN_WARN_HOURS) {
      console.log(JSON.stringify({
        status: 'REFRESH_TOKEN_EXPIRING',
        refresh_token_age_hours: Math.round(ageHours),
        remaining_hours: Math.round(REFRESH_TOKEN_MAX_HOURS - ageHours),
        warning: `🔔 Platts refresh_token 已使用 ${Math.round(ageHours)} 小时，预计约 ${Math.round(REFRESH_TOKEN_MAX_HOURS - ageHours)} 小时后过期。请尽快手动刷新 token。`
      }));
    }
  } else {
    console.error('[Platts] refresh_token_obtained_at not set, will initialize on next refresh');
  }

  try {
    // Check if token needs refresh
    if (tokenNeedsRefresh(config)) {
      try {
        config = await ensureValidPlattsConfig({ thresholdMs: 10 * 60 * 1000, allowPasswordFallback: true });
      } catch (e) {
        console.error('[Platts] Token refresh failed:', e.message);
        if (e.details) {
          console.error('[Platts] Details:', e.details.join(' | '));
        }
        
        if (isTokenExpired(config)) {
          const expiresAt = getTokenExpiry(config);
          const expiredMins = Math.round((Date.now() - expiresAt) / 60000);
          
          console.log(JSON.stringify({
            status: 'TOKEN_REFRESH_FAILED',
            error: `Token 已过期 ${expiredMins} 分钟，所有刷新方法都失败了`,
            details: e.details || [],
            suggestion: '已尝试 refresh 和 TokenGeneration 密码登录，仍然失败'
          }));
          return;
        }
        // Token not yet expired, continue with existing
        console.error('[Platts] Continuing with existing token...');
      }
    }
    
    const hours = 2;
    const allItems = { heards: [], stories: [], topNews: [] };
    
    // 1. Fetch heards
    console.error('[Platts] Scanning heards (geography + updateddate filter)...');
    const heardsData = await fetchAllHeards(config.access_token, 2, hours);
    
    for (const [category, items] of Object.entries(heardsData)) {
      if (!HEARD_OUTPUT_CATEGORIES.has(category)) {
        console.error(`[Platts] ${category}: ${items.length} total, skipped by heards output filter`);
        continue;
      }

      const recent = filterByTime(items, hours);
      const newItems = recent.filter(item => !state.seenHeardIds.includes(item.id));
      console.error(`[Platts] ${category}: ${items.length} total, ${recent.length} recent, ${newItems.length} new`);
      
      for (const item of newItems.slice(0, 10)) {
        const content = await fetchContent(config.access_token, item.id);
        if (content && content.content) {
          const body = stripHtml(content.content.body);
          if (hasMeaningfulContent(item.headline, content.content.body)) {
            allItems.heards.push({
              id: item.id,
              category: category,
              headline: item.headline,
              body: body,
              time: item.updatedDate,
              url: item.documentUrl
            });
          }
        }
      }
    }
    
    // 2. Fetch latest news stories (server-side sector filter)
    console.error('[Platts] Fetching latest-news stories (sector + updateddate filter)...');
    const storiesData = await fetchStories(config.access_token, hours);
    const relevantStories = (storiesData.results || []).filter(item => isStoryRelevant(item, hours));
    const newStories = relevantStories.filter(item => !state.seenStoryIds.includes(item.id));
    console.error(`[Platts] Stories: ${storiesData.results?.length || 0} total, ${relevantStories.length} relevant (sector+keyword), ${newStories.length} new`);
    
    // Stories already have body/sector/commodity/geography from API; extract summary inline
    for (const item of newStories.slice(0, 15)) {
      const body = stripHtml(item.body || '');
      if (body.length < 50) continue;
      // Use first paragraph as summary (API doesn't always include summary in field)
      const firstPara = body.split('.')[0]?.trim() || '';
      allItems.stories.push({
        id: item.id,
        headline: item.headline || '',
        summary: firstPara.length > 20 ? firstPara + '.' : '',
        body: body.substring(0, 2000),
        time: item.updatedDate,
        url: item.documentUrl,
        commodity: item.commodity || [],
        sector: item.sector || [],
        geography: item.geography || [],
      });
    }
    
    // 3. Fetch top news (time filter only, no commodity/sector filter)
    console.error('[Platts] Fetching top news...');
    const topNewsData = await fetchTopNews(config.access_token);
    const recentTopNews = (topNewsData.results || []).filter(item => {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      return new Date(item.updatedDate) > since;
    });
    const newTopNews = recentTopNews.filter(item => !state.seenTopNewsIds.includes(item.id));
    console.error(`[Platts] Top News: ${topNewsData.results?.length || 0} total, ${recentTopNews.length} recent, ${newTopNews.length} new`);
    
    for (const item of newTopNews) {
      const body = stripHtml(item.body || '');
      if (body.length < 50) continue;
      const firstPara = body.split('.')[0]?.trim() || '';
      allItems.topNews.push({
        id: item.id,
        headline: item.headline || '',
        summary: firstPara.length > 20 ? firstPara + '.' : '',
        body: body.substring(0, 2000),
        time: item.updatedDate,
        url: item.documentUrl,
        commodity: item.commodity || [],
        sector: item.sector || [],
        geography: item.geography || [],
      });
    }
    
    const totalNew = allItems.heards.length + allItems.stories.length + allItems.topNews.length;
    console.error(`[Platts] Total new items: ${totalNew} (heards:${allItems.heards.length} stories:${allItems.stories.length} topNews:${allItems.topNews.length})`);
    
    if (totalNew === 0) {
      console.log('NO_NEW_INSIGHTS');
    } else {
      allItems.heards.sort((a, b) => new Date(b.time) - new Date(a.time));
      allItems.stories.sort((a, b) => new Date(b.time) - new Date(a.time));
      allItems.topNews.sort((a, b) => new Date(b.time) - new Date(a.time));
      
      console.log(JSON.stringify({
        status: 'NEW_INSIGHTS',
        heards: allItems.heards,
        stories: allItems.stories,
        topNews: allItems.topNews,
        instructions: '请用中文总结。格式要求：\n' +
          '1. 先输出 🔥 Top News 部分（地缘/政策/供应中断重大新闻），每条后 [序号] 标记\n' +
          '2. 再输出 📰 Market Stories 部分（Platts 市场分析文章摘要），每条后 [序号] 标记\n' +
          '3. 最后输出 📊 Heards 部分，只输出原油相关 Heards，不要输出成品油/燃料油/LNG Heards，每条后 [序号] 标记\n' +
          '4. 消息底部用 --- 分隔，然后列出所有链接：[1] URL\n' +
          '5. 序号与链接必须一一对应\n' +
          '6. 不用**加粗**，纯文本\n' +
          '7. 专业术语：MOC=收盘评估, MOPS=普氏均价, bids=买盘, offers=卖盘, partials=窗口成交'
      }));
    }
    
    // Update state
    const allHeardIds = Object.values(heardsData).flat().map(item => item.id);
    state.seenHeardIds = allHeardIds.slice(0, 500);
    state.seenStoryIds = relevantStories.map(item => item.id).slice(0, 100);
    state.seenTopNewsIds = recentTopNews.map(item => item.id).slice(0, 50);
    state.lastCheckTime = new Date().toISOString();
    saveState(state);
    try { trackUsage(TRACK_USER, 'platts', { action: 'insights-monitor' }); } catch {}
    
  } catch (e) {
    if (e.message === 'TOKEN_EXPIRED' || e.message.includes('401')) {
      console.log(JSON.stringify({
        status: 'TOKEN_EXPIRED',
        error: 'Access token 已过期，需要刷新'
      }));
    } else {
      console.error('[Platts] Error:', e.message);
      console.log(JSON.stringify({ status: 'ERROR', error: e.message }));
    }
  }
}

main();
