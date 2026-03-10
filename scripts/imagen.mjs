#!/usr/bin/env node
/**
 * Gemini Imagen 图像生成脚本
 * 用法: node scripts/imagen.mjs "你的提示词" [输出文件名]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../.config/google-ai/credentials.json');
const outputDir = path.join(__dirname, '../outputs/images');

// 读取 API key
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const API_KEY = config.apiKey;

async function generateImage(prompt, outputName) {
  // 确保输出目录存在
  fs.mkdirSync(outputDir, { recursive: true });
  
  const timestamp = Date.now();
  const filename = outputName || `imagen_${timestamp}.png`;
  const outputPath = path.join(outputDir, filename);
  
  console.log(`🎨 生成图片: "${prompt}"`);
  
  // 使用 Gemini 2.0 Flash 的图像生成能力
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          responseModalities: ["image", "text"]
        }
      })
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API 错误: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  
  // 提取图片数据
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  
  if (!imagePart) {
    console.log('响应:', JSON.stringify(data, null, 2));
    throw new Error('未返回图片');
  }
  
  // 保存图片
  const imageData = Buffer.from(imagePart.inlineData.data, 'base64');
  fs.writeFileSync(outputPath, imageData);
  
  console.log(`✅ 图片已保存: ${outputPath}`);
  return outputPath;
}

// 主函数
const prompt = process.argv[2];
const outputName = process.argv[3];

if (!prompt) {
  console.log('用法: node scripts/imagen.mjs "提示词" [输出文件名]');
  process.exit(1);
}

generateImage(prompt, outputName)
  .then(path => console.log(`OUTPUT:${path}`))
  .catch(err => {
    console.error('❌ 错误:', err.message);
    process.exit(1);
  });
