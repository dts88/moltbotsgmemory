#!/usr/bin/env node
/**
 * Platts Token Refresh Script
 * 使用 refresh_token 自动刷新 access_token
 * 
 * 用法：node scripts/platts-refresh-token.mjs
 */

import { trackUsage } from './usage-tracker.mjs';
import { ensureValidPlattsConfig } from './platts-auth.mjs';

const userArg = process.argv.find(a => a.startsWith('--user='));
const TRACK_USER = userArg ? userArg.split('=')[1] : 'system';

async function refreshToken() {
  try {
    console.log('[Platts Refresh] Refreshing token...');
    const newConfig = await ensureValidPlattsConfig({ forceRefresh: true, allowPasswordFallback: true });
    const expiresAt = new Date(newConfig.expires_at);

    const localTime = expiresAt.toLocaleTimeString('en-SG', { 
      timeZone: 'Asia/Singapore', 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    console.log(`✅ Token refreshed successfully!`);
    console.log(`   Method: ${newConfig.refresh_method || newConfig.auth_method || 'unknown'}`);
    console.log(`   New expiry: ${localTime} SGT`);
    try { trackUsage(TRACK_USER, 'platts', { action: 'token-refresh' }); } catch {}
    
    return { 
      success: true, 
      method: newConfig.refresh_method || newConfig.auth_method,
      expires_at: expiresAt.toISOString(),
      expires_local: `${localTime} SGT`
    };

  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
    if (e.details?.length) {
      e.details.forEach((detail, i) => console.error(`   ${i + 1}. ${detail}`));
    }
    return { success: false, error: e.message, details: e.details || [] };
  }
}

// Run
const result = await refreshToken();
console.log(JSON.stringify(result, null, 2));
process.exit(result.success ? 0 : 1);
