#!/usr/bin/env node
/**
 * Audio transcription using Transformers.js (Whisper) for Node.js
 * Usage: node transcribe.mjs <audio_file>
 */

import { pipeline } from '@xenova/transformers';
import { existsSync, readFileSync } from 'fs';
import { OggOpusDecoder } from 'ogg-opus-decoder';

async function loadOpusAudio(audioPath) {
  console.error('[Audio] Decoding Opus audio...');
  
  const decoder = new OggOpusDecoder();
  await decoder.ready;
  
  const fileBuffer = readFileSync(audioPath);
  const decoded = await decoder.decode(fileBuffer);
  
  // decoded.channelData is an array of Float32Arrays (one per channel)
  // decoded.sampleRate is the sample rate (usually 48000 for Opus)
  
  // Whisper needs 16kHz, so we need to resample
  const inputSampleRate = decoded.sampleRate;
  const targetSampleRate = 16000;
  const audioData = decoded.channelData[0]; // mono
  
  // Simple linear resampling
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
  console.error(`[Audio] Decoded ${(audioData.length / inputSampleRate).toFixed(1)}s audio, resampled to 16kHz`);
  
  return resampled;
}

async function transcribe(audioPath) {
  if (!existsSync(audioPath)) {
    console.error('File not found:', audioPath);
    process.exit(1);
  }

  const audioData = await loadOpusAudio(audioPath);

  console.error('[Whisper] Loading model...');
  const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
    quantized: true,
  });

  console.error('[Whisper] Transcribing...');
  const result = await transcriber(audioData, {
    language: 'chinese',
    task: 'transcribe',
  });

  // Output result
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
