---
name: voice-transcribe
description: 将语音消息（WAV/OGG/Opus）转录为文字，使用本地 Whisper 模型。通常由 WhatsApp 语音消息自动触发，无需手动调用。
---

# Voice Transcribe

脚本: `scripts/transcribe.mjs`
模型: Xenova/whisper-small（量化版，本地运行）
支持格式: WAV (PCM), Opus/OGG

## 用法

```bash
node scripts/transcribe.mjs <音频文件路径>
```

## 自动触发

WhatsApp 语音消息到达时由 OpenClaw 自动调用，一般不需手动使用。

## 支持语言

中文、英文等多语言（whisper-small 自动检测）

## 依赖

- @xenova/transformers
- ogg-opus-decoder
