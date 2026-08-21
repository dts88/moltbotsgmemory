#!/usr/bin/env node

import crypto from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const OPENCLAW_DIR = '/home/node/.openclaw';
const ACCOUNTS_DIR = join(OPENCLAW_DIR, 'openclaw-weixin/accounts');
const DEFAULT_ACCOUNT_ID = '6214e0f129e2-im-bot';
const DEFAULT_TO = 'o9cq805-w6lTHNTZku43nxZTdNuA@im.wechat';

function resolveExtensionDir() {
  const candidates = [join(OPENCLAW_DIR, 'extensions/openclaw-weixin')];
  const npmProjectsDir = join(OPENCLAW_DIR, 'npm/projects');
  if (existsSync(npmProjectsDir)) {
    for (const project of readdirSync(npmProjectsDir)) {
      if (project.startsWith('tencent-weixin-openclaw-weixin-')) {
        candidates.push(
          join(npmProjectsDir, project, 'node_modules/@tencent-weixin/openclaw-weixin')
        );
      }
    }
  }

  const found = candidates.find(dir => existsSync(join(dir, 'package.json')));
  if (!found) {
    throw new Error('WeChat plugin package.json not found; reinstall openclaw-weixin');
  }
  return found;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data.trimEnd()));
    process.stdin.on('error', reject);
  });
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function argFlag(name) {
  return process.argv.includes(`--${name}`);
}

function padBlankLines(text) {
  return text.replace(/\n[ \t]*\n/g, '\n\n\n');
}

function packageClientVersion(version = '0.0.0') {
  const [major = 0, minor = 0, patch = 0] = version
    .split('.')
    .map(part => Number.parseInt(part, 10) || 0);
  return ((major & 0xff) << 16) | ((minor & 0xff) << 8) | (patch & 0xff);
}

function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf8').toString('base64');
}

function generateClientId() {
  return `openclaw-weixin:${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

async function sendText({ accountId, to, text }) {
  const account = JSON.parse(readFileSync(join(ACCOUNTS_DIR, `${accountId}.json`), 'utf8'));
  const contextTokens = JSON.parse(
    readFileSync(join(ACCOUNTS_DIR, `${accountId}.context-tokens.json`), 'utf8')
  );
  const pkg = JSON.parse(readFileSync(join(resolveExtensionDir(), 'package.json'), 'utf8'));
  const contextToken = contextTokens[to];

  if (!account?.token || !account?.baseUrl) {
    throw new Error(`WeChat account ${accountId} is missing token/baseUrl`);
  }
  if (!contextToken) {
    throw new Error(`No WeChat context token cached for ${to}`);
  }

  const body = JSON.stringify({
    msg: {
      from_user_id: '',
      to_user_id: to,
      client_id: generateClientId(),
      message_type: 2,
      message_state: 2,
      item_list: [{ type: 1, text_item: { text } }],
      context_token: contextToken
    },
    base_info: {
      channel_version: pkg.version || 'unknown',
      bot_agent: 'OpenClaw'
    }
  });

  const response = await fetch(new URL('ilink/bot/sendmessage', account.baseUrl).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      AuthorizationType: 'ilink_bot_token',
      Authorization: `Bearer ${account.token}`,
      'Content-Length': String(Buffer.byteLength(body, 'utf8')),
      'X-WECHAT-UIN': randomWechatUin(),
      'iLink-App-Id': pkg.ilink_appid || '',
      'iLink-App-ClientVersion': String(packageClientVersion(pkg.version))
    },
    body
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`WeChat sendmessage HTTP ${response.status}: ${raw.slice(0, 300)}`);
  }

  return raw;
}

async function main() {
  const accountId = argValue('account', DEFAULT_ACCOUNT_ID);
  const to = argValue('to', DEFAULT_TO);
  const input = await readStdin();
  const text = argFlag('pad-blank-lines') ? padBlankLines(input) : input;

  if (!text.trim()) {
    throw new Error('No message text on stdin');
  }

  await sendText({ accountId, to, text });
  process.stdout.write('SENT\n');
}

main().catch(error => {
  process.stderr.write(`[weixin-send-text] ${error.message}\n`);
  process.exit(1);
});
