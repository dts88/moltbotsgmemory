#!/usr/bin/env node
/**
 * Twilio 语音对话服务 - 中文支持版
 * 
 * 使用录音 + Whisper 转录实现多语言对话
 * 带 Twilio 签名验证保护
 * 
 * 启动: node scripts/twilio-webhook.mjs
 * 端口: 3456
 */

import http from 'http';
import { URL } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { createHmac } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 加载 Twilio 凭证
const twilioConfig = JSON.parse(readFileSync(join(__dirname, '../.config/twilio/credentials.json'), 'utf8'));
const TWILIO_AUTH_TOKEN = twilioConfig.authToken;
const TWILIO_ACCOUNT_SID = twilioConfig.accountSid;

const execAsync = promisify(exec);
const PORT = 3456;

// 解析 POST body
async function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const params = new URLSearchParams(body);
      resolve({ params: Object.fromEntries(params), raw: body });
    });
  });
}

// Twilio 签名验证
function validateTwilioSignature(url, params, signature) {
  if (!signature) {
    console.log('⚠️ 缺少 X-Twilio-Signature');
    return false;
  }
  
  // 构建签名字符串：URL + 按字母排序的参数
  let data = url;
  const sortedKeys = Object.keys(params).sort();
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  
  // HMAC-SHA1 签名
  const expectedSignature = createHmac('sha1', TWILIO_AUTH_TOKEN)
    .update(data, 'utf8')
    .digest('base64');
  
  const valid = signature === expectedSignature;
  if (!valid) {
    console.log('⚠️ 签名验证失败');
    console.log('   期望:', expectedSignature);
    console.log('   收到:', signature);
  }
  return valid;
}

// 生成 TwiML 响应
function twiml(content) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${content}</Response>`;
}

// 说话并录音
function sayAndRecord(message, lang = 'zh-CN') {
  const voice = lang === 'zh-CN' ? 'Google.cmn-CN-Standard-A' : 'Google.en-US-Standard-C';
  return twiml(`
    <Say language="${lang}" voice="${voice}">${message}</Say>
    <Record maxLength="30" 
            action="https://voice.ews.sg/recording-complete" 
            recordingStatusCallback="https://voice.ews.sg/recording-status"
            playBeep="true"
            timeout="3" />
    <Say language="${lang}" voice="${voice}">${lang === 'zh-CN' ? '没有听到您说话，再见。' : 'I did not hear you. Goodbye.'}</Say>
  `);
}

// 处理来电 - 开始对话
async function handleIncomingCall(body) {
  console.log('📞 来电:', body.From);
  return sayAndRecord('你好，我是 Moltbot。请在提示音后说话。');
}

// 使用 OpenAI Whisper API 转录（更可靠）
async function transcribeWithWhisper(audioPath) {
  try {
    // 先尝试本地 Whisper
    const { stdout } = await execAsync(
      `node /home/node/clawd/scripts/transcribe.mjs "${audioPath}"`,
      { timeout: 30000 }
    );
    return stdout.trim();
  } catch (err) {
    console.error('本地 Whisper 失败:', err.message);
    
    // 回退：使用 OpenAI Whisper API
    try {
      const { stdout } = await execAsync(
        `curl -s https://api.openai.com/v1/audio/transcriptions \
          -H "Authorization: Bearer $OPENAI_API_KEY" \
          -F file="@${audioPath}" \
          -F model="whisper-1" \
          -F language="zh"`,
        { timeout: 30000 }
      );
      const result = JSON.parse(stdout);
      return result.text || '';
    } catch (apiErr) {
      console.error('OpenAI Whisper 也失败:', apiErr.message);
      return '';
    }
  }
}

// 通过 Twilio API 更新通话
async function updateCall(callSid, twimlContent) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`;
  
  const params = new URLSearchParams();
  params.append('Twiml', twimlContent);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twilio API error: ${response.status} - ${text}`);
  }
  
  return await response.json();
}

// 后台处理语音请求
async function processVoiceInBackground(callSid, transcript, from) {
  console.log('🔄 后台处理开始:', callSid);
  
  try {
    // 检测结束对话
    const q = toSimplified(transcript).toLowerCase();
    if (q.includes('再见') || q.includes('拜拜') || q.includes('没有了') || q.includes('没事') || 
        q.includes('没有啦') || q.includes('bye') || q.includes('goodbye')) {
      await updateCall(callSid, twiml(`
        <Say language="zh-CN" voice="Google.cmn-CN-Standard-A">好的，再见！祝你愉快！</Say>
        <Hangup/>
      `));
      return;
    }
    
    // 发送到 hooks 处理
    const requestId = `voice-${Date.now()}`;
    console.log('📤 发送到 hooks:', requestId);
    
    // 创建响应文件路径
    const responseFile = `${VOICE_REQUESTS_DIR}/${requestId}.json`;
    
    const response = await fetch(`${OPENCLAW_URL}/hooks/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HOOKS_TOKEN}`
      },
      body: JSON.stringify({
        message: `[语音请求 ${requestId}]

用户通过电话问: "${transcript}"

请完成以下步骤：
1. 思考并回答这个问题（简洁，1-3句话，适合语音播报，不要 markdown）
2. 【重要】用 exec 工具执行命令，把你的回答保存到文件：

echo '你的回答内容' > ${responseFile}

必须执行这个命令，否则用户听不到回复！`
      })
    });
    
    if (!response.ok) {
      throw new Error(`Hooks error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('📤 Hooks 请求已发送:', data.runId);
    
    // 轮询等待响应文件
    const maxWait = 120000; // 最多等待 2 分钟
    const pollInterval = 2000; // 每 2 秒检查一次
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      // 检查响应文件
      try {
        if (existsSync(responseFile)) {
          const content = readFileSync(responseFile, 'utf8').trim();
          // 清理文件
          try { unlinkSync(responseFile); } catch {}
          
          if (content && content.length > 2) {
            console.log('✅ 获取到回复:', content.substring(0, 100));
            
            // 清理回复（去掉可能的引号）
            let reply = content.replace(/^['"]|['"]$/g, '').trim();
            reply = reply.substring(0, 500); // 限制长度
            
            // 更新通话
            await updateCall(callSid, twiml(`
              <Say language="zh-CN" voice="Google.cmn-CN-Standard-A">${reply}</Say>
              <Pause length="1"/>
              <Say language="zh-CN" voice="Google.cmn-CN-Standard-A">还有其他问题吗？</Say>
              <Record maxLength="30" 
                      action="https://voice.ews.sg/recording-complete" 
                      playBeep="true"
                      timeout="8" />
              <Say language="zh-CN" voice="Google.cmn-CN-Standard-A">好的，再见！</Say>
            `));
            return;
          }
        }
      } catch (e) {
        console.error('检查文件失败:', e.message);
      }
      
      console.log(`⏳ 等待响应... ${Math.round((Date.now() - startTime) / 1000)}s`);
    }
    
    // 超时
    console.error('⏰ 处理超时');
    await updateCall(callSid, twiml(`
      <Say language="zh-CN" voice="Google.cmn-CN-Standard-A">抱歉，处理时间太长了。请稍后再试，或者通过 WhatsApp 联系我。</Say>
      <Hangup/>
    `));
    
  } catch (err) {
    console.error('后台处理错误:', err);
    try {
      await updateCall(callSid, twiml(`
        <Say language="zh-CN" voice="Google.cmn-CN-Standard-A">抱歉，处理出现问题。请稍后再试。</Say>
        <Hangup/>
      `));
    } catch {}
  }
}

// 处理录音完成
async function handleRecordingComplete(body) {
  const recordingUrl = body.RecordingUrl;
  const callSid = body.CallSid;
  const from = body.From || 'unknown';
  
  console.log('🎤 录音完成:', recordingUrl, 'CallSid:', callSid);
  
  if (!recordingUrl) {
    return sayAndRecord('没有收到录音，请再试一次。');
  }

  try {
    // 下载录音（WAV 格式，需要 Twilio 认证）
    const audioPath = `/tmp/twilio-recording-${Date.now()}.wav`;
    await execAsync(`curl -s -u "${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}" "${recordingUrl}.wav" -o "${audioPath}"`, { timeout: 15000 });
    
    console.log('📥 录音已下载:', audioPath);
    
    // Whisper 转录
    const transcript = await transcribeWithWhisper(audioPath);
    
    // 清理临时文件
    try { unlinkSync(audioPath); } catch {}
    
    console.log('📝 识别结果:', transcript);
    
    if (!transcript || transcript.length < 2) {
      return sayAndRecord('抱歉没有听清，请再说一遍。');
    }

    // 启动后台处理（不等待）
    processVoiceInBackground(callSid, transcript, from).catch(err => {
      console.error('后台处理失败:', err);
    });
    
    // 立即返回等待音乐
    return twiml(`
      <Say language="zh-CN" voice="Google.cmn-CN-Standard-A">好的，请稍等，我想一想。</Say>
      <Play loop="10">https://api.twilio.com/cowbell.mp3</Play>
      <Say language="zh-CN" voice="Google.cmn-CN-Standard-A">抱歉让你久等了，请稍后再试。</Say>
      <Hangup/>
    `);
    
  } catch (err) {
    console.error('处理错误:', err);
    return sayAndRecord('处理出现问题，请再说一遍。');
  }
}

// OpenClaw hooks 配置
const OPENCLAW_URL = 'http://127.0.0.1:18789';
const HOOKS_TOKEN = '14fcc9ba73365ba2d3d374d1a020f0c3e50cdb34e0a3eac1';
const VOICE_REQUESTS_DIR = '/home/node/clawd/.voice-requests';

// 确保目录存在
try { 
  const { mkdirSync } = await import('fs');
  mkdirSync(VOICE_REQUESTS_DIR, { recursive: true }); 
} catch {}

// 通过 OpenClaw hooks 获取 AI 回复
async function askOpenClaw(query, requestId) {
  console.log('🤖 发送到 OpenClaw hooks...');
  
  // 发送请求到 hooks
  const response = await fetch(`${OPENCLAW_URL}/hooks/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HOOKS_TOKEN}`
    },
    body: JSON.stringify({
      message: `[语音请求 ID:${requestId}]

用户通过电话说: "${query}"

请回答这个问题。回答后，务必执行以下命令保存响应：
\`\`\`bash
echo '{"response": "你的回答内容"}' > /home/node/clawd/.voice-requests/${requestId}.response.json
\`\`\`

要求：
- 用简洁的中文回答，适合语音播报（1-3句话）
- 不要用 markdown 或特殊格式
- 回答后一定要执行上面的命令保存响应`
    })
  });
  
  if (!response.ok) {
    throw new Error(`Hooks error: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('📤 Hooks 请求已发送:', data.runId);
  
  // 轮询等待响应文件
  const responseFile = `${VOICE_REQUESTS_DIR}/${requestId}.response.json`;
  const maxWait = 60000; // 最多等待 60 秒
  const pollInterval = 1000; // 每秒检查一次
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    try {
      if (existsSync(responseFile)) {
        const content = readFileSync(responseFile, 'utf8');
        const result = JSON.parse(content);
        // 清理文件
        try { unlinkSync(responseFile); } catch {}
        console.log('✅ 收到响应:', result.response);
        return result.response;
      }
    } catch {}
    
    // 等待后继续轮询
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error('等待响应超时');
}

// 简繁转换（常用字）
function toSimplified(text) {
  const map = {
    '氣': '气', '過': '过', '見': '见', '沒': '没', '說': '说', '這': '这', '時': '时',
    '會': '会', '個': '个', '來': '来', '為': '为', '們': '们', '經': '经', '樣': '样',
    '問': '问', '題': '题', '機': '机', '開': '开', '關': '关', '電': '电', '話': '话',
    '東': '东', '車': '车', '學': '学', '國': '国', '幾': '几', '點': '点', '裡': '里',
    '進': '进', '發': '发', '現': '现', '長': '长', '頭': '头', '麼': '么', '與': '与',
    '對': '对', '無': '无', '書': '书', '愛': '爱', '網': '网', '號': '号', '費': '费'
  };
  return text.split('').map(c => map[c] || c).join('');
}

// 处理用户问题 - 全部交给 LLM 智能处理
async function processQuery(query, from) {
  console.log('🤔 处理问题:', query);
  
  // 转换为简体
  const q = toSimplified(query).toLowerCase();
  
  // 结束对话检测（这个保留，因为需要控制挂断）
  if (q.includes('再见') || q.includes('拜拜') || q.includes('没有了') || q.includes('就这样') ||
      q.includes('没事') || q.includes('没有啦') || q.includes('bye') || q.includes('goodbye')) {
    return '__END_CALL__';
  }
  
  // 所有其他问题 - 交给 OpenClaw (Claude) 处理
  try {
    const requestId = `voice-${Date.now()}`;
    const answer = await askOpenClaw(query, requestId);
    return answer || '抱歉，我没有理解你的问题，请再说一遍。';
  } catch (err) {
    console.error('OpenClaw 处理错误:', err.message);
    return '抱歉，处理出现问题，请稍后再试。';
  }
}

// HTTP 服务器
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  console.log(`${req.method} ${url.pathname}`);
  
  // 健康检查
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }
  
  // Twilio webhook
  if (req.method === 'POST') {
    const { params: body, raw } = await parseBody(req);
    
    // 签名验证
    const signature = req.headers['x-twilio-signature'];
    const fullUrl = `https://voice.ews.sg${url.pathname}`;
    
    if (!validateTwilioSignature(fullUrl, body, signature)) {
      console.log('🚫 拒绝未授权请求:', req.socket.remoteAddress);
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: Invalid signature');
      return;
    }
    
    console.log('✅ 签名验证通过');
    let twimlResponse;
    
    switch (url.pathname) {
      case '/voice':
        twimlResponse = await handleIncomingCall(body);
        break;
      case '/recording-complete':
        twimlResponse = await handleRecordingComplete(body);
        break;
      case '/recording-status':
        // 录音状态回调，只记录日志
        console.log('📊 录音状态:', body.RecordingStatus);
        res.writeHead(200);
        res.end('OK');
        return;
      case '/process-speech':
        // 兼容旧的 Gather 模式
        twimlResponse = sayAndRecord('请说话。');
        break;
      default:
        twimlResponse = twiml('<Say language="zh-CN">未知端点</Say>');
    }
    
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    res.end(twimlResponse);
    return;
  }
  
  // 默认响应
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Twilio Voice Webhook - 中文支持版 (Whisper)');
});

server.listen(PORT, () => {
  console.log(`🚀 Twilio 语音对话服务已启动: http://localhost:${PORT}`);
  console.log('');
  console.log('端点:');
  console.log('  POST /voice            - 来电处理');
  console.log('  POST /recording-complete - 录音处理');
  console.log('  GET  /health           - 健康检查');
  console.log('');
  console.log('✨ 中文支持版：使用 Whisper 转录');
});
