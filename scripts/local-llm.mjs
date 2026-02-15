#!/usr/bin/env node
/**
 * 本地 LLM 调用 (Ollama)
 * 用于简单任务，节省 API token
 */

const OLLAMA_URL = 'http://192.168.1.101:11434';

// 模型配置 (根据 2026-02-15 测试结果)
// - qwen3:4b: 17.5 t/s, 中文最佳 ⭐
// - huihui_ai/qwen3-abliterated:8b: 备用，质量更高但较慢
const DEFAULT_MODEL = 'qwen3:4b';

/**
 * 调用本地模型
 * @param {string} prompt - 提示词
 * @param {object} options - 可选参数
 * @returns {Promise<{response: string, duration: number}>}
 */
export async function generate(prompt, options = {}) {
  const {
    model = DEFAULT_MODEL,
    temperature = 0.3,
    maxTokens = 200,
    noThink = true,  // 默认关闭思考模式
    timeout = 60000
  } = options;
  
  // 如果需要关闭思考，追加 /no_think
  const finalPrompt = noThink ? `${prompt} /no_think` : prompt;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
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
    let response = data.response || '';
    response = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
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
 * 翻译文本
 */
export async function translate(text, targetLang = '中文') {
  const prompt = `Translate to ${targetLang}: ${text}\n\n${targetLang}:`;
  return generate(prompt, { temperature: 0.1, maxTokens: 300 });
}

/**
 * 文本摘要
 */
export async function summarize(text, maxWords = 50) {
  const prompt = `用${maxWords}字以内总结以下内容：\n\n${text}\n\n摘要：`;
  return generate(prompt, { temperature: 0.2, maxTokens: 150 });
}

/**
 * 文本分类
 */
export async function classify(text, categories) {
  const prompt = `将以下文本分类到这些类别之一：${categories.join(', ')}\n\n文本：${text}\n\n类别：`;
  return generate(prompt, { temperature: 0.1, maxTokens: 20 });
}

/**
 * 检查 Ollama 是否可用
 */
export async function healthCheck() {
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

// CLI 测试
if (process.argv[1]?.endsWith('local-llm.mjs')) {
  const action = process.argv[2];
  const text = process.argv.slice(3).join(' ');
  
  if (action === 'health') {
    healthCheck().then(r => console.log(JSON.stringify(r, null, 2)));
  } else if (action === 'translate') {
    translate(text).then(r => {
      console.log('译文:', r.response);
      console.log('耗时:', r.duration, '秒');
    });
  } else if (action === 'summarize') {
    summarize(text).then(r => {
      console.log('摘要:', r.response);
      console.log('耗时:', r.duration, '秒');
    });
  } else if (action === 'generate') {
    generate(text).then(r => {
      console.log('响应:', r.response);
      console.log('耗时:', r.duration, '秒');
    });
  } else {
    console.log(`
用法:
  node local-llm.mjs health                    # 检查 Ollama 状态
  node local-llm.mjs translate <英文文本>       # 翻译
  node local-llm.mjs summarize <文本>          # 摘要
  node local-llm.mjs generate <提示词>         # 通用生成
    `);
  }
}
