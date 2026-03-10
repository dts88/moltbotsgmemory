#!/usr/bin/env node
/**
 * Platts Token Refresh Script
 * 使用 refresh_token 自动刷新 access_token
 * 
 * 用法：node scripts/platts-refresh-token.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { trackUsage } from './usage-tracker.mjs';

const userArg = process.argv.find(a => a.startsWith('--user='));
const TRACK_USER = userArg ? userArg.split('=')[1] : 'system';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CONFIG_FILE = join(WORKSPACE, '.config/spglobal/credentials.json');

// Working endpoint - no client_id required!
const TOKEN_URL = 'https://api.platts.com/auth/api/token';

async function refreshToken() {
  if (!existsSync(CONFIG_FILE)) {
    console.error('❌ No credentials file found');
    return { success: false, error: 'No credentials file' };
  }

  const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  
  if (!config.refresh_token) {
    console.error('❌ No refresh_token in credentials');
    return { success: false, error: 'No refresh_token' };
  }

  console.log('[Platts Refresh] Refreshing token via api.platts.com...');

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: config.refresh_token
      }).toString()
    });

    const text = await response.text();

    if (!response.ok) {
      console.error(`❌ Refresh failed: ${response.status}`);
      console.error(text.substring(0, 500));
      return { success: false, error: `HTTP ${response.status}`, details: text };
    }

    const data = JSON.parse(text);

    if (!data.access_token) {
      console.error('❌ No access_token in response');
      return { success: false, error: 'No access_token in response' };
    }

    // Update config
    const now = new Date();
    const expiresIn = data.expires_in || 3600;
    const expiresAt = new Date(now.getTime() + expiresIn * 1000);

    // Track refresh_token age: if API returned a new one, reset the clock
    const newRefreshToken = data.refresh_token || config.refresh_token;
    const refreshTokenChanged = data.refresh_token && data.refresh_token !== config.refresh_token;
    const refreshTokenObtainedAt = refreshTokenChanged
      ? now.toISOString()
      : (config.refresh_token_obtained_at || now.toISOString());

    const newConfig = {
      token_type: data.token_type || 'Bearer',
      access_token: data.access_token,
      refresh_token: newRefreshToken,
      refresh_token_obtained_at: refreshTokenObtainedAt,
      expires_in: expiresIn,
      scope: data.scope || config.scope,
      id_token: data.id_token || config.id_token,
      updated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      refresh_method: 'api.platts.com/auth/api/token'
    };

    writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2));

    const localTime = expiresAt.toLocaleTimeString('en-SG', { 
      timeZone: 'Asia/Singapore', 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    console.log(`✅ Token refreshed successfully!`);
    console.log(`   New expiry: ${localTime} SGT`);
    try { trackUsage(TRACK_USER, 'platts', { action: 'token-refresh' }); } catch {}
    
    return { 
      success: true, 
      expires_at: expiresAt.toISOString(),
      expires_local: `${localTime} SGT`
    };

  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// Run
const result = await refreshToken();
console.log(JSON.stringify(result, null, 2));
process.exit(result.success ? 0 : 1);
