#!/usr/bin/env node
/**
 * 本地 LLM 调用
 * 用于简单任务，节省 API token
 */

const OLLAMA_URL = trimTrailingSlash(
  process.env.OLLAMA_URL || process.env.LOCAL_OLLAMA_URL || 'http://192.168.1.101:11434'
);
const LLAMA_URL = trimTrailingSlash(
  process.env.LLAMA_URL || process.env.LOCAL_LLAMA_URL || 'http://192.168.1.101:8000'
);

// 模型配置 (根据 2026-02-15 测试结果)
// - qwen3:4b: 17.5 t/s, 中文最佳 ⭐
// - huihui_ai/qwen3-abliterated:8b: 备用，质量更高但较慢
const DEFAULT_MODEL = 'qwen3:4b';
const DEFAULT_PROVIDER = process.env.LOCAL_LLM_PROVIDER || 'ollama';
const DEFAULT_LLAMA_MODEL = process.env.LLAMA_MODEL || process.env.LOCAL_LLAMA_MODEL || 'llama';

function trimTrailingSlash(url) {
  return url.replace(/\/+$/, '');
}

function timeoutSignal(timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return { controller, timeoutId };
}

function cleanResponse(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/**
 * 调用本地模型
 * @param {string} prompt - 提示词
 * @param {object} options - 可选参数
 * @returns {Promise<{response: string, duration: number}>}
 */
export async function generate(prompt, options = {}) {
  const { provider = DEFAULT_PROVIDER } = options;

  if (provider === 'llama') {
    return generateLlama(prompt, options);
  }

  if (provider !== 'ollama') {
    throw new Error(`Unsupported local LLM provider: ${provider}`);
  }

  return generateOllama(prompt, options);
}

export async function generateOllama(prompt, options = {}) {
  const {
    model = DEFAULT_MODEL,
    temperature = 0.3,
    maxTokens = 200,
    noThink = true,  // 默认关闭思考模式
    timeout = 60000
  } = options;
  
  // 如果需要关闭思考，追加 /no_think
  const finalPrompt = noThink ? `${prompt} /no_think` : prompt;
  
  const { controller, timeoutId } = timeoutSignal(timeout);
  
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: finalPrompt,
        stream: false,
        options: {
          temperature,
          num_predict: maxTokens
        }
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      throw new Error(`Ollama error: ${res.status}`);
    }
    
    const data = await res.json();
    
    // 清理思考标签（以防万一）
    const response = cleanResponse(data.response);
    
    return {
      response,
      duration: Math.round((data.total_duration || 0) / 1e6) / 1000, // 秒
      tokens: data.eval_count || 0
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Ollama timeout');
    }
    throw err;
  }
}

/**
 * 调用本地 llama Docker（OpenAI-compatible API）
 * 适配 llama.cpp server、vLLM、text-generation-webui 等常见 /v1/chat/completions 端点。
 */
export async function generateLlama(prompt, options = {}) {
  const {
    model = DEFAULT_LLAMA_MODEL,
    temperature = 0.3,
    maxTokens = 200,
    url = LLAMA_URL,
    timeout = 60000,
    system = 'You are a concise, accurate assistant.'
  } = options;

  const { controller, timeoutId } = timeoutSignal(timeout);
  const started = Date.now();

  try {
    const res = await fetch(`${trimTrailingSlash(url)}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.LLAMA_API_KEY ? { Authorization: `Bearer ${process.env.LLAMA_API_KEY}` } : {})
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Llama error: ${res.status}${body ? ` ${body.slice(0, 200)}` : ''}`);
    }

    const data = await res.json();
    const response = cleanResponse(data.choices?.[0]?.message?.content);

    return {
      response,
      duration: Math.round((Date.now() - started) / 100) / 10,
      tokens: data.usage?.completion_tokens || 0,
      model: data.model || model
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Llama timeout');
    }
    throw err;
  }
}

/**
 * 翻译文本
 */
export async function translate(text, targetLang = '中文', options = {}) {
  const prompt = `Translate to ${targetLang}: ${text}\n\n${targetLang}:`;
  return generate(prompt, { temperature: 0.1, maxTokens: 300, ...options });
}

/**
 * 文本摘要
 */
export async function summarize(text, maxWords = 50, options = {}) {
  const prompt = `用${maxWords}字以内总结以下内容：\n\n${text}\n\n摘要：`;
  return generate(prompt, { temperature: 0.2, maxTokens: 150, ...options });
}

/**
 * 文本分类
 */
export async function classify(text, categories, options = {}) {
  const prompt = `将以下文本分类到这些类别之一：${categories.join(', ')}\n\n文本：${text}\n\n类别：`;
  return generate(prompt, { temperature: 0.1, maxTokens: 20, ...options });
}

/**
 * 检查本地模型服务是否可用
 */
export async function healthCheck(provider = 'ollama', options = {}) {
  if (provider === 'all') {
    return {
      ollama: await healthCheck('ollama', options),
      llama: await healthCheck('llama', options)
    };
  }

  if (provider === 'llama') {
    return healthCheckLlama(options);
  }

  if (provider !== 'ollama') {
    return { ok: false, error: `Unsupported local LLM provider: ${provider}` };
  }

  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { 
      signal: AbortSignal.timeout(5000) 
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { 
      ok: true, 
      models: data.models?.map(m => m.name) || [] 
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function healthCheckLlama(options = {}) {
  const { url = LLAMA_URL } = options;
  try {
    const res = await fetch(`${trimTrailingSlash(url)}/v1/models`, {
      headers: process.env.LLAMA_API_KEY ? { Authorization: `Bearer ${process.env.LLAMA_API_KEY}` } : {},
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, url };
    const data = await res.json();
    return {
      ok: true,
      url,
      models: data.data?.map(m => m.id) || []
    };
  } catch (err) {
    return { ok: false, error: err.message, url };
  }
}

function parseCliArgs(args) {
  const flags = {};
  const textParts = [];

  for (const arg of args) {
    if (arg.startsWith('--provider=')) flags.provider = arg.slice('--provider='.length);
    else if (arg.startsWith('--model=')) flags.model = arg.slice('--model='.length);
    else if (arg.startsWith('--url=')) flags.url = arg.slice('--url='.length);
    else if (arg.startsWith('--max-tokens=')) flags.maxTokens = Number(arg.slice('--max-tokens='.length));
    else if (arg.startsWith('--temperature=')) flags.temperature = Number(arg.slice('--temperature='.length));
    else textParts.push(arg);
  }

  return { flags, text: textParts.join(' ') };
}

function printResult(label, result) {
  console.log(`${label}:`, result.response);
  console.log('耗时:', result.duration, '秒');
  if (result.model) console.log('模型:', result.model);
}

// CLI 测试
if (process.argv[1]?.endsWith('local-llm.mjs')) {
  const action = process.argv[2];
  const { flags, text } = parseCliArgs(process.argv.slice(3));
  
  if (action === 'health') {
    healthCheck(process.argv[3] || 'ollama').then(r => console.log(JSON.stringify(r, null, 2)));
  } else if (action === 'llama') {
    generateLlama(text, flags).then(r => printResult('响应', r));
  } else if (action === 'translate') {
    generate(`Translate to 中文: ${text}\n\n中文:`, { temperature: 0.1, maxTokens: 300, ...flags })
      .then(r => printResult('译文', r));
  } else if (action === 'summarize') {
    generate(`用50字以内总结以下内容：\n\n${text}\n\n摘要：`, { temperature: 0.2, maxTokens: 150, ...flags })
      .then(r => printResult('摘要', r));
  } else if (action === 'generate') {
    generate(text, flags).then(r => printResult('响应', r));
  } else {
    console.log(`
用法:
  node scripts/local-llm.mjs health [ollama|llama|all]       # 检查服务状态
  node scripts/local-llm.mjs generate <提示词>                # 默认本地模型生成
  node scripts/local-llm.mjs llama <提示词>                   # 使用 llama Docker
  node scripts/local-llm.mjs translate <英文文本>             # 翻译
  node scripts/local-llm.mjs summarize <文本>                 # 摘要

选项:
  --provider=ollama|llama
  --model=<模型名>
  --url=<服务地址>
  --max-tokens=<数量>
  --temperature=<数值>
    `);
  }
}
