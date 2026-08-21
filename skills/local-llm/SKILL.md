---
name: local-llm
description: 调用本地 Ollama LLM 处理简单任务（批量翻译、文本摘要、预分类等），节省 API token。触发词：本地LLM、Ollama、节省token、批量翻译、批量摘要、用本地模型。
---

# Local LLM (Ollama + local llama)

脚本: `scripts/local-llm.mjs`
默认 Ollama 地址: `http://192.168.1.101:11434`
默认 llama 地址: `http://192.168.1.101:8000`（OpenAI-compatible API）

## 调用方式

```js
import { generate } from './scripts/local-llm.mjs';

const result = await generate('翻译这段文字：Hello World', {
  maxTokens: 200,
  temperature: 0.3,
  noThink: true           // 默认关闭思考模式（更快）
});
// result.response, result.duration
```

不传 `model` 时，脚本会使用其内置默认模型。

使用本地 Docker llama：

```js
import { generateLlama, generate } from './scripts/local-llm.mjs';

const direct = await generateLlama('Summarize this in one sentence.');

const viaProvider = await generate('Summarize this in one sentence.', {
  provider: 'llama',
  model: 'llama',
  url: 'http://192.168.1.101:8000'
});
```

CLI：

```bash
node scripts/local-llm.mjs health all
node scripts/local-llm.mjs llama "Say hello in Chinese"
node scripts/local-llm.mjs generate --provider=llama --url=http://192.168.1.101:8000 "Say hello"
```

环境变量：
- `LOCAL_LLM_PROVIDER=ollama|llama`：切换 `generate()` 默认 provider
- `OLLAMA_URL` / `LOCAL_OLLAMA_URL`：覆盖 Ollama 地址
- `LLAMA_URL` / `LOCAL_LLAMA_URL`：覆盖 llama Docker 地址
- `LLAMA_MODEL` / `LOCAL_LLAMA_MODEL`：覆盖 llama 模型名
- `LLAMA_API_KEY`：如 llama 服务需要 Bearer token

## 可用模型

| 模型 | 速度 | 用途 |
|------|------|------|
| qwen3:4b | 17 t/s | 默认，日常推荐 |
| huihui_ai/qwen3-abliterated:8b | 10 t/s | 质量更高 |
| llama | 待测 | 本地 Docker llama，适合英文/通用任务 |

## 适用场景

- 批量翻译（节省 Claude token）
- 简单摘要 / 预分类
- 重复性低价值任务

## 质量控制

本地模型质量低于 Claude，使用时需抽检：
- 低密度抽检，跨场景覆盖（翻译/摘要/分类各抽到）
- 发现明显错误立即告知用户
- 节约 token 的前提是质量可靠

## 注意

- Ollama 和 llama Docker 运行在 192.168.1.101（Unraid 服务器）
- llama Docker 需要暴露 OpenAI-compatible `/v1/chat/completions` 和 `/v1/models`
- 无法访问时检查服务器网络状态
