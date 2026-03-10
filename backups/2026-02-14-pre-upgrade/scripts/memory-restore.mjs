#!/usr/bin/env node
/**
 * Memory Restore - Decrypt memory backup from Moltbook
 * Usage: node memory-restore.mjs <encrypted-string>
 */

import { createHash, createDecipheriv } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const CONFIG_FILE = join(WORKSPACE, '.memory-backup-config.json');

function decrypt(encryptedData, key) {
  const keyHash = createHash('sha256').update(key).digest();
  const [ivB64, authTagB64, encrypted] = encryptedData.split(':');
  
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  
  const decipher = createDecipheriv('aes-256-gcm', keyHash, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

function main() {
  const encryptedData = process.argv[2];
  
  if (!encryptedData) {
    console.error('Usage: node memory-restore.mjs <encrypted-string>');
    console.error('Copy the encrypted string from a Moltbook backup post');
    process.exit(1);
  }
  
  // Load encryption key from config
  if (!existsSync(CONFIG_FILE)) {
    console.error('Config file not found. Need encryption key.');
    process.exit(1);
  }
  
  const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  
  if (!config.encryptionKey) {
    console.error('No encryption key in config');
    process.exit(1);
  }
  
  try {
    const decrypted = decrypt(encryptedData.trim(), config.encryptionKey);
    const memory = JSON.parse(decrypted);
    
    console.log('=== MEMORY RESTORED ===');
    console.log(`Timestamp: ${memory.timestamp}`);
    console.log(`Files: ${Object.keys(memory.files).length}`);
    console.log('');
    
    for (const [file, content] of Object.entries(memory.files)) {
      console.log(`--- ${file} ---`);
      console.log(content.slice(0, 500) + (content.length > 500 ? '\n...[truncated]' : ''));
      console.log('');
    }
    
    // Verify hash
    const hash = createHash('sha256').update(JSON.stringify(memory)).digest('hex').slice(0, 8);
    console.log(`Verification hash: ${hash}`);
    
  } catch (e) {
    console.error('Decryption failed:', e.message);
    process.exit(1);
  }
}

main();
