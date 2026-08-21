#!/usr/bin/env node
/**
 * Platts Login Script
 * 使用用户名密码登录获取新的 access_token 和 refresh_token
 * 
 * 用法：
 *   node scripts/platts-login.mjs <username> <password>
 *   node scripts/platts-login.mjs  # 交互式输入
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { loginPlattsWithPassword, PLATTS_CONFIG_FILE } from './platts-auth.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');

async function login(username, password) {
  console.log(`[Platts Login] Logging in as ${username}...`);

  try {
    const config = await loginPlattsWithPassword(username, password);
    console.log(`\n✅ Login successful via ${config.refresh_method || config.auth_method}!`);
    console.log(`   Token expires at: ${config.expires_at}`);
    console.log(`   Refresh token: ${config.refresh_token ? 'Yes' : 'No'}`);
    console.log(`   Config saved to: ${PLATTS_CONFIG_FILE}`);
    return { success: true, config };
  } catch (e) {
    console.log('\n❌ Login failed. All methods attempted:');
    (e.details || [e.message]).forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
    return { success: false, errors: e.details || [e.message] };
  }
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
