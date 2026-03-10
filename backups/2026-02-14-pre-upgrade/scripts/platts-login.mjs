#!/usr/bin/env node
/**
 * Platts Login Script
 * 使用用户名密码登录获取新的 access_token 和 refresh_token
 * 
 * 用法：
 *   node scripts/platts-login.mjs <username> <password>
 *   node scripts/platts-login.mjs  # 交互式输入
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CONFIG_FILE = join(WORKSPACE, '.config/spglobal/credentials.json');

// SPGlobal OAuth endpoints
const AUTH_ENDPOINTS = [
  {
    name: 'Okta Authorize',
    url: 'https://secure.signin.spglobal.com/oauth2/spglobal/v1/token',
    buildBody: (username, password) => new URLSearchParams({
      grant_type: 'password',
      username: username,
      password: password,
      scope: 'openid profile api plapi offline_access',
      client_id: 'PL_API_PLATFORM'
    }).toString(),
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    }
  },
  {
    name: 'Platts Auth API',
    url: 'https://api.platts.com/auth/api',
    buildBody: (username, password) => new URLSearchParams({
      username: username,
      password: password
    }).toString(),
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'moltbot/1.0'
    }
  }
];

function saveConfig(config) {
  const dir = dirname(CONFIG_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function login(username, password) {
  console.log(`[Platts Login] Logging in as ${username}...`);
  
  const errors = [];
  
  for (const endpoint of AUTH_ENDPOINTS) {
    console.log(`[Platts Login] Trying ${endpoint.name}...`);
    
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: endpoint.headers,
        body: endpoint.buildBody(username, password)
      });
      
      const text = await response.text();
      
      if (!response.ok) {
        errors.push(`${endpoint.name}: ${response.status} - ${text.substring(0, 200)}`);
        console.log(`[Platts Login] ${endpoint.name} failed: ${response.status}`);
        continue;
      }
      
      const data = JSON.parse(text);
      
      if (!data.access_token) {
        errors.push(`${endpoint.name}: No access_token in response`);
        continue;
      }
      
      // Success!
      const now = Date.now();
      const expiresIn = data.expires_in || 3600;
      
      const config = {
        token_type: data.token_type || 'Bearer',
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: expiresIn,
        expires_at: new Date(now + expiresIn * 1000).toISOString(),
        token_updated_at: new Date(now).toISOString(),
        username: username,
        auth_method: endpoint.name
      };
      
      saveConfig(config);
      
      console.log(`\n✅ Login successful via ${endpoint.name}!`);
      console.log(`   Token expires at: ${config.expires_at}`);
      console.log(`   Refresh token: ${data.refresh_token ? 'Yes' : 'No'}`);
      console.log(`   Config saved to: ${CONFIG_FILE}`);
      
      return { success: true, config };
      
    } catch (e) {
      errors.push(`${endpoint.name}: ${e.message}`);
      console.log(`[Platts Login] ${endpoint.name} error: ${e.message}`);
    }
  }
  
  console.log('\n❌ Login failed. All methods attempted:');
  errors.forEach((e, i) => console.log(`   ${i + 1}. ${e}`));
  
  return { success: false, errors };
}

async function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr
  });
  
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  let username = process.argv[2];
  let password = process.argv[3];
  
  if (!username) {
    username = await prompt('Username (email): ');
  }
  
  if (!password) {
    // For security, in real usage you'd want to use a proper password prompt
    password = await prompt('Password: ');
  }
  
  if (!username || !password) {
    console.error('Usage: node platts-login.mjs <username> <password>');
    process.exit(1);
  }
  
  const result = await login(username, password);
  
  if (result.success) {
    // Output for programmatic use
    console.log(JSON.stringify({ success: true, expires_at: result.config.expires_at }));
  } else {
    console.log(JSON.stringify({ success: false, errors: result.errors }));
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
