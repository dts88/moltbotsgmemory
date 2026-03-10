import { pipeline } from '@xenova/transformers';
import { OggOpusDecoder } from 'ogg-opus-decoder';
import { readFileSync } from 'fs';

const audioPath = process.argv[2];
if (!audioPath) {
  console.error('Usage: node scripts/transcribe-long.mjs <audio_file>');
  process.exit(1);
}

console.error('[Audio] Loading Opus file...');
const audioBuffer = readFileSync(audioPath);
const decoder = new OggOpusDecoder();
await decoder.ready;
const decoded = await decoder.decodeFile(new Uint8Array(audioBuffer));
decoder.free();

// Resample to 16kHz
const inputRate = decoded.sampleRate;
const outputRate = 16000;
const ratio = outputRate / inputRate;
const newLength = Math.round(decoded.channelData[0].length * ratio);
const resampled = new Float32Array(newLength);

for (let i = 0; i < newLength; i++) {
  const srcIdx = i / ratio;
  const idx0 = Math.floor(srcIdx);
  const idx1 = Math.min(idx0 + 1, decoded.channelData[0].length - 1);
  const frac = srcIdx - idx0;
  resampled[i] = decoded.channelData[0][idx0] * (1 - frac) + decoded.channelData[0][idx1] * frac;
}

const duration = resampled.length / outputRate;
console.error(`[Audio] Duration: ${duration.toFixed(1)}s`);

console.error('[Whisper] Loading model...');
const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
  quantized: true,
});

console.error('[Whisper] Transcribing with chunking...');
const result = await transcriber(resampled, {
  language: 'chinese',
  task: 'transcribe',
  chunk_length_s: 30,
  stride_length_s: 5,
});

console.log(result.text);
