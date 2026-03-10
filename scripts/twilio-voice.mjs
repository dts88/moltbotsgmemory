#!/usr/bin/env node
/**
 * Twilio 语音控制脚本
 * 
 * 用法:
 *   node scripts/twilio-voice.mjs call <number> <message>  # 拨打电话播报消息
 *   node scripts/twilio-voice.mjs status                   # 查看账户状态
 *   node scripts/twilio-voice.mjs calls                    # 查看通话记录
 *   node scripts/twilio-voice.mjs webhook-url <url>        # 设置来电 webhook
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '../.config/twilio/credentials.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const auth = Buffer.from(config.accountSid + ':' + config.authToken).toString('base64');

async function twilioRequest(path, method = 'GET', body = null) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}${path}`;
  const opts = {
    method,
    headers: { 'Authorization': 'Basic ' + auth }
  };
  
  if (body) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(body).toString();
  }
  
  const res = await fetch(url, opts);
  return res.json();
}

async function status() {
  const balance = await twilioRequest('/Balance.json');
  const numbers = await twilioRequest('/IncomingPhoneNumbers.json');
  
  console.log('=== Twilio 账户状态 ===');
  console.log(`余额: $${balance.balance} ${balance.currency}`);
  console.log(`号码: ${numbers.incoming_phone_numbers?.map(n => n.phone_number).join(', ') || '无'}`);
}

async function makeCall(to, message) {
  // 格式化电话号码
  let toNumber = to.replace(/[\s-]/g, '');
  if (!toNumber.startsWith('+')) {
    if (toNumber.startsWith('65')) toNumber = '+' + toNumber;
    else if (toNumber.length === 8) toNumber = '+65' + toNumber;  // 新加坡
    else toNumber = '+' + toNumber;
  }
  
  console.log(`📞 正在拨打 ${toNumber}...`);
  console.log(`   ⚠️ 试用账户: 接听后需按任意键才能听到消息`);
  
  // 使用 TwiML 播报消息，然后录音（支持中文）
  const webhookBase = 'https://voice.ews.sg';
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="zh-CN" voice="Google.cmn-CN-Standard-A">${message}</Say>
  <Pause length="1"/>
  <Record maxLength="30" 
          action="${webhookBase}/recording-complete" 
          playBeep="true"
          timeout="3" />
  <Say language="zh-CN" voice="Google.cmn-CN-Standard-A">没有听到您说话，再见。</Say>
</Response>`;
  
  const result = await twilioRequest('/Calls.json', 'POST', {
    To: toNumber,
    From: config.phoneNumber,
    Twiml: twiml,
    StatusCallback: 'https://claw.ews.sg/webhook/twilio/status'
  });
  
  if (result.sid) {
    console.log('✅ 呼叫已发起');
    console.log(`   Call SID: ${result.sid}`);
    console.log(`   状态: ${result.status}`);
  } else {
    console.log('❌ 呼叫失败:', result.message || JSON.stringify(result));
  }
  
  return result;
}

async function listCalls() {
  const result = await twilioRequest('/Calls.json?PageSize=10');
  
  console.log('=== 最近通话记录 ===');
  if (result.calls && result.calls.length > 0) {
    result.calls.forEach(call => {
      const dir = call.direction === 'inbound' ? '📥' : '📤';
      const duration = call.duration ? `${call.duration}秒` : '-';
      console.log(`${dir} ${call.from} → ${call.to} | ${call.status} | ${duration} | ${call.start_time || call.date_created}`);
    });
  } else {
    console.log('暂无通话记录');
  }
}

async function setWebhook(url) {
  const result = await twilioRequest(`/IncomingPhoneNumbers/${config.phoneSid}.json`, 'POST', {
    VoiceUrl: url,
    VoiceMethod: 'POST'
  });
  
  if (result.sid) {
    console.log('✅ Webhook 已设置');
    console.log(`   Voice URL: ${result.voice_url}`);
  } else {
    console.log('❌ 设置失败:', result.message);
  }
}

// 主入口
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'status':
    await status();
    break;
  case 'call':
    if (args.length < 2) {
      console.log('用法: node scripts/twilio-voice.mjs call <号码> <消息>');
      console.log('示例: node scripts/twilio-voice.mjs call +6592716786 "这是测试消息"');
    } else {
      await makeCall(args[0], args.slice(1).join(' '));
    }
    break;
  case 'calls':
    await listCalls();
    break;
  case 'webhook-url':
    if (!args[0]) {
      console.log('用法: node scripts/twilio-voice.mjs webhook-url <URL>');
    } else {
      await setWebhook(args[0]);
    }
    break;
  default:
    console.log(`
Twilio 语音控制

用法:
  node scripts/twilio-voice.mjs status                    # 查看账户状态
  node scripts/twilio-voice.mjs call <号码> <消息>         # 拨打电话
  node scripts/twilio-voice.mjs calls                     # 查看通话记录
  node scripts/twilio-voice.mjs webhook-url <url>         # 设置来电 webhook

示例:
  node scripts/twilio-voice.mjs call +6592716786 "您好，这是测试"
`);
}
