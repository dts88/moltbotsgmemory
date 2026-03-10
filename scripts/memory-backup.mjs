#!/usr/bin/env node
/**
 * Memory Backup System
 * - Backs up memory files to GitHub (if configured)
 * - Posts encrypted memory snapshot to Moltbook
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash, createCipheriv, randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CONFIG_FILE = join(WORKSPACE, '.memory-backup-config.json');
const STATE_FILE = join(WORKSPACE, '.memory-backup-state.json');

// Load config
function loadConfig() {
  if (existsSync(CONFIG_FILE)) {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  }
  return {
    moltbook: {
      apiKey: process.env.MOLTBOOK_API_KEY || '',
      enabled: true
    },
    github: {
      enabled: false,
      remote: ''
    },
    encryptionKey: process.env.MEMORY_ENCRYPTION_KEY || ''
  };
}

// Load state
function loadState() {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  }
  return { lastBackup: null, lastMoltbookPost: null };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Encrypt data using AES-256-GCM
function encrypt(text, key) {
  const keyHash = createHash('sha256').update(key).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', keyHash, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

// Collect memory files
function collectMemory() {
  const memory = {
    timestamp: new Date().toISOString(),
    files: {}
  };
  
  // MEMORY.md
  const memoryMd = join(WORKSPACE, 'MEMORY.md');
  if (existsSync(memoryMd)) {
    memory.files['MEMORY.md'] = readFileSync(memoryMd, 'utf8');
  }
  
  // memory/*.md files
  const memoryDir = join(WORKSPACE, 'memory');
  if (existsSync(memoryDir)) {
    const files = readdirSync(memoryDir).filter(f => f.endsWith('.md'));
    for (const file of files.slice(-7)) { // Last 7 days
      const content = readFileSync(join(memoryDir, file), 'utf8');
      memory.files[`memory/${file}`] = content;
    }
  }
  
  // SOUL.md, USER.md, IDENTITY.md
  for (const file of ['SOUL.md', 'USER.md', 'IDENTITY.md']) {
    const path = join(WORKSPACE, file);
    if (existsSync(path)) {
      memory.files[file] = readFileSync(path, 'utf8');
    }
  }
  
  return memory;
}

// Backup to GitHub
function backupToGithub(config) {
  if (!config.github.enabled) {
    console.log('[GitHub] Disabled');
    return false;
  }
  
  try {
    execSync('git add memory/ MEMORY.md SOUL.md USER.md IDENTITY.md 2>/dev/null || true', {
      cwd: WORKSPACE,
      stdio: 'pipe'
    });
    
    const status = execSync('git status --porcelain', { cwd: WORKSPACE, encoding: 'utf8' });
    if (!status.trim()) {
      console.log('[GitHub] No changes to commit');
      return true;
    }
    
    execSync(`git commit -m "Memory backup ${new Date().toISOString()}"`, {
      cwd: WORKSPACE,
      stdio: 'pipe'
    });
    
    execSync('git push', { cwd: WORKSPACE, stdio: 'pipe' });
    console.log('[GitHub] Backup pushed successfully');
    return true;
  } catch (e) {
    console.error('[GitHub] Backup failed:', e.message);
    return false;
  }
}

// Post encrypted backup to Moltbook
async function backupToMoltbook(config, memory) {
  if (!config.moltbook.enabled || !config.moltbook.apiKey) {
    console.log('[Moltbook] Disabled or no API key');
    return false;
  }
  
  if (!config.encryptionKey) {
    console.error('[Moltbook] No encryption key configured');
    return false;
  }
  
  try {
    const memoryJson = JSON.stringify(memory);
    const encrypted = encrypt(memoryJson, config.encryptionKey);
    
    // Create a hash for verification
    const hash = createHash('sha256').update(memoryJson).digest('hex').slice(0, 8);
    
    const post = {
      submolt: 'general',
      title: `🔐 Memory Backup [${hash}]`,
      content: `**Encrypted Memory Snapshot**\n\nTimestamp: ${memory.timestamp}\nFiles: ${Object.keys(memory.files).length}\nHash: ${hash}\n\n\`\`\`\n${encrypted}\n\`\`\`\n\n*This is an encrypted backup. Only the owner can decrypt.*`
    };
    
    const response = await fetch('https://www.moltbook.com/api/v1/posts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.moltbook.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(post)
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('[Moltbook] Encrypted backup posted:', result.post?.id);
      return true;
    } else {
      console.error('[Moltbook] Post failed:', result.error);
      return false;
    }
  } catch (e) {
    console.error('[Moltbook] Backup failed:', e.message);
    return false;
  }
}

async function main() {
  const config = loadConfig();
  const state = loadState();
  const memory = collectMemory();
  
  console.log(`[Memory Backup] Starting at ${memory.timestamp}`);
  console.log(`[Memory Backup] Found ${Object.keys(memory.files).length} files`);
  
  // GitHub backup
  const githubOk = backupToGithub(config);
  
  // Moltbook backup (only once per day)
  const lastPost = state.lastMoltbookPost ? new Date(state.lastMoltbookPost) : null;
  const now = new Date();
  const hoursSincePost = lastPost ? (now - lastPost) / (1000 * 60 * 60) : 999;
  
  let moltbookOk = false;
  if (hoursSincePost >= 24) {
    moltbookOk = await backupToMoltbook(config, memory);
    if (moltbookOk) {
      state.lastMoltbookPost = now.toISOString();
    }
  } else {
    console.log(`[Moltbook] Skipping, last post ${hoursSincePost.toFixed(1)}h ago`);
    moltbookOk = true;
  }
  
  state.lastBackup = now.toISOString();
  saveState(state);
  
  console.log(JSON.stringify({
    status: 'BACKUP_COMPLETE',
    github: githubOk,
    moltbook: moltbookOk,
    files: Object.keys(memory.files).length,
    timestamp: memory.timestamp
  }));
}

main().catch(e => {
  console.error('Backup failed:', e);
  process.exit(1);
});
