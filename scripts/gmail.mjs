#!/usr/bin/env node
/**
 * Gmail 邮件收发脚本
 * 使用 IMAP/SMTP + 应用专用密码
 */

import nodemailer from 'nodemailer';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '../.config/gmail/credentials.json');

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

// 发送邮件
async function sendMail(to, subject, text, html = null) {
  const config = loadConfig();
  
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.email,
      pass: config.app_password.replace(/\s/g, '')
    }
  });
  
  const mailOptions = {
    from: config.email,
    to,
    subject,
    text,
    html: html || text
  };
  
  const result = await transporter.sendMail(mailOptions);
  console.log('✅ 邮件已发送:', result.messageId);
  return result;
}

// 读取收件箱
async function fetchInbox(limit = 10, unseen = false) {
  const config = loadConfig();
  
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.email,
      password: config.app_password.replace(/\s/g, ''),
      host: config.imap.host,
      port: config.imap.port,
      tls: config.imap.secure,
      tlsOptions: { rejectUnauthorized: false }
    });
    
    const messages = [];
    
    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err) {
          reject(err);
          return;
        }
        
        const searchCriteria = unseen ? ['UNSEEN'] : ['ALL'];
        
        imap.search(searchCriteria, (err, results) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (results.length === 0) {
            console.log('📭 收件箱无' + (unseen ? '未读' : '') + '邮件');
            imap.end();
            resolve([]);
            return;
          }
          
          // 获取最新的 N 封
          const toFetch = results.slice(-limit);
          
          const fetch = imap.fetch(toFetch, {
            bodies: '',
            struct: true
          });
          
          fetch.on('message', (msg, seqno) => {
            msg.on('body', (stream) => {
              simpleParser(stream, (err, parsed) => {
                if (!err) {
                  messages.push({
                    seqno,
                    from: parsed.from?.text,
                    to: parsed.to?.text,
                    subject: parsed.subject,
                    date: parsed.date,
                    text: parsed.text?.substring(0, 500),
                    hasAttachments: parsed.attachments?.length > 0
                  });
                }
              });
            });
          });
          
          fetch.once('error', reject);
          fetch.once('end', () => {
            imap.end();
          });
        });
      });
    });
    
    imap.once('error', reject);
    imap.once('end', () => {
      // 按日期排序，最新的在前
      messages.sort((a, b) => new Date(b.date) - new Date(a.date));
      resolve(messages);
    });
    
    imap.connect();
  });
}

// 测试连接
async function testConnection() {
  const config = loadConfig();
  console.log('📧 测试 Gmail 连接...');
  console.log('   邮箱:', config.email);
  
  // 测试 SMTP
  try {
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.email,
        pass: config.app_password.replace(/\s/g, '')
      }
    });
    
    await transporter.verify();
    console.log('✅ SMTP 连接成功');
  } catch (e) {
    console.log('❌ SMTP 连接失败:', e.message);
    return false;
  }
  
  // 测试 IMAP
  try {
    const messages = await fetchInbox(1);
    console.log('✅ IMAP 连接成功');
    console.log('   收件箱邮件数:', messages.length > 0 ? '有邮件' : '空');
  } catch (e) {
    console.log('❌ IMAP 连接失败:', e.message);
    return false;
  }
  
  return true;
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

switch (cmd) {
  case 'test':
    testConnection().then(ok => {
      process.exit(ok ? 0 : 1);
    });
    break;
    
  case 'send':
    const to = args[1];
    const subject = args[2];
    const body = args[3];
    if (!to || !subject || !body) {
      console.log('用法: node gmail.mjs send <to> <subject> <body>');
      process.exit(1);
    }
    sendMail(to, subject, body).then(() => {
      process.exit(0);
    }).catch(e => {
      console.error('发送失败:', e.message);
      process.exit(1);
    });
    break;
    
  case 'inbox':
    const limit = parseInt(args[1]) || 5;
    const unseen = args[2] === '--unseen';
    fetchInbox(limit, unseen).then(msgs => {
      console.log(`\n📬 收件箱 (最新 ${limit} 封${unseen ? '未读' : ''}):\n`);
      msgs.forEach((m, i) => {
        console.log(`${i + 1}. ${m.subject}`);
        console.log(`   From: ${m.from}`);
        console.log(`   Date: ${m.date}`);
        console.log(`   ${m.text?.substring(0, 100)}...`);
        console.log('');
      });
      process.exit(0);
    }).catch(e => {
      console.error('读取失败:', e.message);
      process.exit(1);
    });
    break;
    
  default:
    console.log(`Gmail 邮件工具

用法:
  node gmail.mjs test              测试连接
  node gmail.mjs send <to> <subject> <body>  发送邮件
  node gmail.mjs inbox [n] [--unseen]        读取收件箱
`);
}

export { sendMail, fetchInbox, testConnection };
