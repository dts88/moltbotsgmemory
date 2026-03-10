#!/usr/bin/env node
/**
 * Twitter/X Monitor for multiple accounts
 * - Fetches latest tweets from configured users
 * - Detects new ones (compares with stored state per user)
 * - Translates to Chinese using Google Translate
 * - Outputs formatted messages ready to send
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const STATE_FILE = join(WORKSPACE, '.twitter-monitor-state.json');

// Users to monitor
const TARGET_USERS = ['JavierBlas', 'realDonaldTrump'];

// Dynamic import for ESM module
async function translateText(text) {
  try {
    const { translate } = await import('google-translate-api-x');
    const result = await translate(text, { to: 'zh-CN' });
    return result.text;
  } catch (e) {
    console.error('Translation failed:', e.message);
    return null;
  }
}

function loadEnv() {
  const envFile = join(WORKSPACE, '.twitter-env');
  if (existsSync(envFile)) {
    const content = readFileSync(envFile, 'utf8');
    for (const line of content.split('\n')) {
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
  }
}

function loadState() {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  }
  return { users: {}, lastCheck: null };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function fetchTweets(username) {
  loadEnv();
  try {
    const result = execSync(
      `cd "${WORKSPACE}" && npx bird user-tweets @${username} -n 5 --json --plain`,
      { 
        encoding: 'utf8', 
        timeout: 30000, 
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      }
    );
    // Find the JSON array in output (skip info lines)
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error(`Failed to fetch tweets for @${username}:`, e.message);
    return [];
  }
}

async function main() {
  const state = loadState();
  if (!state.users) state.users = {};
  
  const allNewTweets = [];

  for (const username of TARGET_USERS) {
    const tweets = fetchTweets(username);
    
    if (tweets.length === 0) continue;

    // Verify tweets belong to target user
    const validTweets = tweets.filter(t => 
      t.author?.username?.toLowerCase() === username.toLowerCase()
    );

    if (validTweets.length === 0) continue;

    const lastSeenId = state.users[username]?.lastSeenId;
    
    // Find new tweets (ID > lastSeenId)
    const newTweets = lastSeenId 
      ? validTweets.filter(t => BigInt(t.id) > BigInt(lastSeenId))
      : [validTweets[0]]; // First run: only show latest

    if (newTweets.length > 0) {
      // Update state with newest ID
      const newestId = validTweets.reduce((max, t) => 
        BigInt(t.id) > BigInt(max) ? t.id : max, validTweets[0].id
      );
      
      state.users[username] = {
        lastSeenId: newestId,
        lastCheck: new Date().toISOString()
      };

      // Add to results
      for (const t of newTweets) {
        allNewTweets.push({
          id: t.id,
          username: t.author?.username || username,
          displayName: t.author?.name || username,
          text: t.text,
          createdAt: t.createdAt,
          url: `https://x.com/${t.author?.username || username}/status/${t.id}`
        });
      }
    }
  }

  // Save updated state
  state.lastCheck = new Date().toISOString();
  saveState(state);

  if (allNewTweets.length === 0) {
    console.log('NO_NEW_TWEETS');
    return;
  }

  // Translate and format messages
  const messages = [];
  for (const tweet of allNewTweets) {
    const translation = await translateText(tweet.text);
    const formatted = `🐦 @${tweet.username}\n${tweet.text}${translation ? `\n\n${translation}` : ''}\n\n${tweet.url}`;
    messages.push(formatted);
  }

  // Output ready-to-send messages
  console.log(JSON.stringify({
    status: 'NEW_TWEETS',
    count: messages.length,
    messages: messages
  }));
}

main();
