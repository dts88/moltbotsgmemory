#!/usr/bin/env node
/**
 * Audio transcription using Transformers.js (Whisper) for Node.js
 * Supports: WAV (PCM), Opus/OGG
 * Usage: node transcribe.mjs <audio_file>
 */

import { pipeline } from '@xenova/transformers';
import { existsSync, readFileSync } from 'fs';

// 读取 WAV 文件
function loadWavAudio(audioPath) {
  console.error('[Audio] Loading WAV file...');
  
  const buffer = readFileSync(audioPath);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  
  // 解析 WAV header
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riff !== 'RIFF') {
    throw new Error('Not a valid WAV file');
  }
  
  // 查找 fmt 和 data chunks
  let offset = 12;
  let sampleRate = 8000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let dataOffset = 0;
  let dataSize = 0;
  
  while (offset < buffer.length - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset + 1),
      view.getUint8(offset + 2), view.getUint8(offset + 3)
    );
    const chunkSize = view.getUint32(offset + 4, true);
    
    if (chunkId === 'fmt ') {
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }
    
    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset++; // padding
  }
  
  if (dataOffset === 0) {
    throw new Error('No data chunk found in WAV file');
  }
  
  console.error(`[Audio] WAV: ${sampleRate}Hz, ${numChannels}ch, ${bitsPerSample}bit`);
  
  // 读取 PCM 数据并转换为 Float32Array
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = Math.floor(dataSize / (bytesPerSample * numChannels));
  const audioData = new Float32Array(numSamples);
  
  for (let i = 0; i < numSamples; i++) {
    const sampleOffset = dataOffset + i * bytesPerSample * numChannels;
    let sample;
    
    if (bitsPerSample === 16) {
      sample = view.getInt16(sampleOffset, true) / 32768.0;
    } else if (bitsPerSample === 8) {
      sample = (view.getUint8(sampleOffset) - 128) / 128.0;
    } else {
      sample = view.getInt16(sampleOffset, true) / 32768.0;
    }
    
    audioData[i] = sample;
  }
  
  // 重采样到 16kHz (Whisper 需要)
  const targetSampleRate = 16000;
  if (sampleRate !== targetSampleRate) {
    const ratio = sampleRate / targetSampleRate;
    const outputLength = Math.floor(numSamples / ratio);
    const resampled = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, numSamples - 1);
      const t = srcIndex - srcIndexFloor;
      resampled[i] = audioData[srcIndexFloor] * (1 - t) + audioData[srcIndexCeil] * t;
    }
    
    console.error(`[Audio] Resampled ${(numSamples / sampleRate).toFixed(1)}s to 16kHz`);
    return resampled;
  }
  
  console.error(`[Audio] Loaded ${(numSamples / sampleRate).toFixed(1)}s audio`);
  return audioData;
}

// 读取 Opus 文件
async function loadOpusAudio(audioPath) {
  console.error('[Audio] Loading Opus file...');
  
  const { OggOpusDecoder } = await import('ogg-opus-decoder');
  const decoder = new OggOpusDecoder();
  await decoder.ready;
  
  const fileBuffer = readFileSync(audioPath);
  const decoded = await decoder.decode(fileBuffer);
  
  const inputSampleRate = decoded.sampleRate;
  const targetSampleRate = 16000;
  const audioData = decoded.channelData[0];
  
  const ratio = inputSampleRate / targetSampleRate;
  const outputLength = Math.floor(audioData.length / ratio);
  const resampled = new Float32Array(outputLength);
  
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
    const t = srcIndex - srcIndexFloor;
    resampled[i] = audioData[srcIndexFloor] * (1 - t) + audioData[srcIndexCeil] * t;
  }
  
  decoder.free();
  console.error(`[Audio] Decoded ${(audioData.length / inputSampleRate).toFixed(1)}s Opus, resampled to 16kHz`);
  
  return resampled;
}

// 自动检测格式并加载
async function loadAudio(audioPath) {
  const buffer = readFileSync(audioPath);
  
  // 检查文件头
  const header = String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]);
  
  if (header === 'RIFF') {
    return loadWavAudio(audioPath);
  } else if (header === 'OggS') {
    return loadOpusAudio(audioPath);
  } else {
    // 尝试 WAV
    console.error('[Audio] Unknown format, trying WAV...');
    return loadWavAudio(audioPath);
  }
}

async function transcribe(audioPath) {
  if (!existsSync(audioPath)) {
    console.error('File not found:', audioPath);
    process.exit(1);
  }

  const audioData = await loadAudio(audioPath);

  console.error('[Whisper] Loading model...');
  const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
    quantized: true,
  });

  console.error('[Whisper] Transcribing...');
  const result = await transcriber(audioData, {
    language: 'chinese',
    task: 'transcribe',
  });

  console.log(result.text);
}

const audioFile = process.argv[2];
if (!audioFile) {
  console.error('Usage: node transcribe.mjs <audio_file>');
  process.exit(1);
}

transcribe(audioFile).catch(e => {
  console.error('Transcription error:', e.message);
  process.exit(1);
});
