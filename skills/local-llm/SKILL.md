---
name: local-llm
description: 调用本地 Ollama LLM 处理简单任务（批量翻译、文本摘要、预分类等），节省 API token。触发词：本地LLM、Ollama、节省token、批量翻译、批量摘要、用本地模型。
---

# Local LLM (Ollama)

脚本: `scripts/local-llm.mjs`
地址: `http://192.168.1.101:11434`

## 调用方式

```js
import { generate } from './scripts/local-llm.mjs';

const result = await generate('翻译这段文字：Hello World', {
  model: 'qwen3:4b',      // 默认，17 t/s，中文最佳
  maxTokens: 200,
  temperature: 0.3,
  noThink: true           // 默认关闭思考模式（更快）
});
// result.response, result.duration
```

## 可用模型

| 模型 | 速度 | 用途 |
|------|------|------|
| qwen3:4b | 17 t/s | 默认，日常推荐 |
| huihui_ai/qwen3-abliterated:8b | 10 t/s | 质量更高 |

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

- Ollama 运行在 192.168.1.101（Unraid 服务器）
- 无法访问时检查服务器网络状态
