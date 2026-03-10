#!/usr/bin/env node
/**
 * Platts Monitor v6
 * - 多端点 Token 刷新（Platts官方 + Okta）
 * - Heards: 扫描多页获取原油、成品油、燃料油、LNG
 * - Story (Insight News): 原油、成品油、LNG
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CONFIG_FILE = join(WORKSPACE, '.config/spglobal/credentials.json');
const STATE_FILE = join(WORKSPACE, '.platts-monitor-state.json');

const API_BASE = 'https://api.platts.com';

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

// Heards keyword patterns for categorization
const HEARDS_PATTERNS = {
  crude: ['crude', 'dubai', 'murban', 'oman', 'brent', 'espo', 'basrah', 'urals', 'wti', 'upper zakum'],
  products: ['gasoline', 'gasoil', 'diesel', 'jet', 'kerosene', 'naphtha', 'mogas', '92 ron', '95 ron', '97 ron'],
  fuelOil: ['fuel oil', 'bunker', 'vlsfo', 'hsfo', 'mgo', 'lsfo', '380 cst', '180 cst', 'mf 0.5', 'marine fuel'],
  lng: ['lng', 'liquefied natural gas', 'jkm', 'des nwe', 'des japan'],
};

// Story keywords
const STORY_KEYWORDS = [
  'crude', 'dubai', 'murban', 'wti', 'brent', 'oman', 'upper zakum', 'basrah', 'espo',
  'gasoline', 'gasoil', 'diesel', 'jet', 'kerosene', 'naphtha', 'mops',
  '92 ron', '95 ron', '97 ron', 'mogas',
  'fuel oil', 'bunker', 'vlsfo', 'hsfo', 'mgo', 'lsfo', '380 cst', '180 cst', 'mf 0.5',
  'lng', 'liquefied natural gas', 'jkm',
];

const MUST_HAVE_PATTERNS = ['crude moc'];
const SKIP_HEADLINE_PATTERNS = ['Daily Rationale & Exclusions', 'Rationale & Exclusions', 'Rationales & Exclusions', 'Weekly Rationale'];
const EXCLUDED_COMMODITIES = ['acrylonitrile', 'acn', 'epoxy', 'styrene', 'mtbe', 'ethanolamine', 'pvc', 'polyethylene', 'polypropylene', 'hdpe', 'ldpe', 'benzene', 'toluene', 'xylene', 'methanol', 'ethanol', 'acetone', 'phenol', 'ammonia', 'urea', 'sulfur'];

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    throw new Error('Credentials not found');
  }
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
}

function saveConfig(config) {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
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
      
      const newConfig = {
        token_type: data.token_type || 'Bearer',
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,
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
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  }
  return { lastCheckTime: null, seenHeardIds: [], seenStoryIds: [] };
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

async function fetchAllHeards(token, maxPages = 15) {
  const allHeards = { crude: [], products: [], fuelOil: [], lng: [] };
  
  for (let page = 1; page <= maxPages; page++) {
    const url = `${API_BASE}/news-insights/v1/search/heards?pageSize=100&page=${page}`;
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
      const category = categorizeHeards(item.headline);
      if (category && allHeards[category]) {
        allHeards[category].push(item);
      }
    }
  }
  
  return allHeards;
}

async function fetchStories(token) {
  const url = `${API_BASE}/news-insights/v1/search/story?pageSize=50`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('TOKEN_EXPIRED');
    throw new Error(`Story API Error: ${response.status}`);
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

function hasMeaningfulContent(body) {
  if (!body) return false;
  const text = stripHtml(body);
  const skipPatterns = ['No bids/offers/trades', 'No trades reported'];
  return !skipPatterns.some(p => text.includes(p)) && text.length > 50;
}

function filterByTime(items, hours) {
  const since = Date.now() - hours * 60 * 60 * 1000;
  return items.filter(item => new Date(item.updatedDate).getTime() > since);
}

async function main() {
  let config = loadConfig();
  const state = loadState();
  
  console.error('[Platts] Starting v6 (multi-endpoint refresh)...');
  
  try {
    // Check if token needs refresh
    if (tokenNeedsRefresh(config)) {
      try {
        config = await refreshAccessToken(config);
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
            suggestion: '可能需要重新登录获取新的 refresh_token'
          }));
          return;
        }
        // Token not yet expired, continue with existing
        console.error('[Platts] Continuing with existing token...');
      }
    }
    
    const hours = 2;
    const allItems = { heards: [], stories: [] };
    
    // 1. Fetch heards
    console.error('[Platts] Scanning heards...');
    const heardsData = await fetchAllHeards(config.access_token, 15);
    
    for (const [category, items] of Object.entries(heardsData)) {
      const recent = filterByTime(items, hours);
      const newItems = recent.filter(item => !state.seenHeardIds.includes(item.id));
      console.error(`[Platts] ${category}: ${items.length} total, ${recent.length} recent, ${newItems.length} new`);
      
      for (const item of newItems.slice(0, 10)) {
        const content = await fetchContent(config.access_token, item.id);
        if (content && content.content) {
          const body = stripHtml(content.content.body);
          if (hasMeaningfulContent(content.content.body)) {
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
    
    // 2. Fetch stories
    console.error('[Platts] Fetching stories...');
    const storiesData = await fetchStories(config.access_token);
    const relevantStories = (storiesData.results || []).filter(item => isStoryRelevant(item, hours));
    const newStories = relevantStories.filter(item => !state.seenStoryIds.includes(item.id));
    console.error(`[Platts] Stories: ${storiesData.results?.length || 0} total, ${relevantStories.length} relevant, ${newStories.length} new`);
    
    for (const item of newStories.slice(0, 15)) {
      const content = await fetchContent(config.access_token, item.id);
      if (content) {
        const commodities = content.properties?.commodity || [];
        if (!isCommodityAllowed(commodities)) continue;
        
        const headline = content.properties?.headline?.headline || item.headline;
        const summary = stripHtml(content.properties?.summary || '');
        const body = stripHtml(content.content?.body || '');
        
        if (body.length > 50 || summary.length > 20) {
          allItems.stories.push({
            id: item.id,
            headline: headline,
            summary: summary,
            body: body.substring(0, 2000),
            time: item.updatedDate,
            url: item.documentUrl,
            commodity: commodities
          });
        }
      }
    }
    
    const totalNew = allItems.heards.length + allItems.stories.length;
    console.error(`[Platts] Total new items: ${totalNew}`);
    
    if (totalNew === 0) {
      console.log('NO_NEW_INSIGHTS');
    } else {
      allItems.heards.sort((a, b) => new Date(b.time) - new Date(a.time));
      allItems.stories.sort((a, b) => new Date(b.time) - new Date(a.time));
      
      console.log(JSON.stringify({
        status: 'NEW_INSIGHTS',
        heards: allItems.heards,
        stories: allItems.stories,
        instructions: '请用中文总结。Heards 按品种分组（crude/products/fuelOil/lng）合并成一条消息发送。Stories 按品种分组，每条后附链接。格式：不用**加粗，纯文本。专业翻译：MOC=收盘评估, MOPS=普氏均价, bids=买盘, offers=卖盘, partials=窗口成交。'
      }));
    }
    
    // Update state
    const allHeardIds = Object.values(heardsData).flat().map(item => item.id);
    state.seenHeardIds = allHeardIds.slice(0, 500);
    state.seenStoryIds = relevantStories.map(item => item.id).slice(0, 100);
    state.lastCheckTime = new Date().toISOString();
    saveState(state);
    
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
