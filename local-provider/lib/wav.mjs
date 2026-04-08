import { ModelInvokeError } from './errors.mjs';

function readChunkMap(buffer) {
  const chunks = new Map();
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    chunks.set(id, buffer.subarray(start, end));
    offset = end + (size % 2);
  }
  return chunks;
}

export function decodeWaveToMonoFloat32(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new ModelInvokeError('本地 TTS 返回的音频不是可解析的 WAV 文件。');
  }

  const chunks = readChunkMap(buffer);
  const fmtChunk = chunks.get('fmt ');
  const dataChunk = chunks.get('data');
  if (!fmtChunk || !dataChunk || fmtChunk.length < 16) {
    throw new ModelInvokeError('WAV 缺少 fmt/data 片段，无法拼接时间轴。');
  }

  const audioFormat = fmtChunk.readUInt16LE(0);
  const channels = fmtChunk.readUInt16LE(2);
  const sampleRate = fmtChunk.readUInt32LE(4);
  const bitsPerSample = fmtChunk.readUInt16LE(14);
  if (!channels || !sampleRate) {
    throw new ModelInvokeError('WAV 头信息无效。');
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.floor(dataChunk.length / bytesPerSample / channels);
  const monoSamples = new Float32Array(frameCount);

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    let mixed = 0;
    for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
      const sampleOffset = (frameIndex * channels + channelIndex) * bytesPerSample;
      let value = 0;

      if (audioFormat === 1 && bitsPerSample === 8) {
        value = (dataChunk.readUInt8(sampleOffset) - 128) / 128;
      } else if (audioFormat === 1 && bitsPerSample === 16) {
        value = dataChunk.readInt16LE(sampleOffset) / 32768;
      } else if (audioFormat === 1 && bitsPerSample === 24) {
        value = dataChunk.readIntLE(sampleOffset, 3) / 8388608;
      } else if (audioFormat === 1 && bitsPerSample === 32) {
        value = dataChunk.readInt32LE(sampleOffset) / 2147483648;
      } else if (audioFormat === 3 && bitsPerSample === 32) {
        value = dataChunk.readFloatLE(sampleOffset);
      } else {
        throw new ModelInvokeError(`暂不支持的 WAV 编码：format=${audioFormat}, bits=${bitsPerSample}`);
      }

      mixed += value;
    }
    monoSamples[frameIndex] = mixed / channels;
  }

  return {
    sampleRate,
    samples: monoSamples,
  };
}

export function resampleFloat32(samples, inputRate, outputRate) {
  if (inputRate === outputRate) {
    return samples;
  }

  const outputLength = Math.max(1, Math.round(samples.length * (outputRate / inputRate)));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ((samples.length - 1) / Math.max(1, outputLength - 1));
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const fraction = position - leftIndex;
    output[index] = samples[leftIndex] * (1 - fraction) + samples[rightIndex] * fraction;
  }

  return output;
}

export function mixTimeline(entries, options = {}) {
  const sampleRate = options.sampleRate || 32000;
  const tailPadSec = options.tailPadSec || 0.25;
  let totalFrames = Math.ceil(tailPadSec * sampleRate);
  const preparedEntries = entries.map((entry) => {
    const resampled = resampleFloat32(entry.samples, entry.sampleRate, sampleRate);
    const startFrame = Math.max(0, Math.round(entry.start * sampleRate));
    totalFrames = Math.max(totalFrames, startFrame + resampled.length + Math.ceil(tailPadSec * sampleRate));
    return {
      ...entry,
      startFrame,
      outputSamples: resampled,
    };
  });

  const mixed = new Float32Array(totalFrames);
  for (const entry of preparedEntries) {
    for (let index = 0; index < entry.outputSamples.length; index += 1) {
      mixed[entry.startFrame + index] += entry.outputSamples[index];
    }
  }

  let peak = 0;
  for (const value of mixed) {
    peak = Math.max(peak, Math.abs(value));
  }

  if (peak > 0.98) {
    const gain = 0.98 / peak;
    for (let index = 0; index < mixed.length; index += 1) {
      mixed[index] *= gain;
    }
  }

  return {
    sampleRate,
    samples: mixed,
  };
}

export function encodeWave16(samples, sampleRate) {
  const pcmLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + pcmLength);
  buffer.write('RIFF', 0, 4, 'ascii');
  buffer.writeUInt32LE(36 + pcmLength, 4);
  buffer.write('WAVE', 8, 4, 'ascii');
  buffer.write('fmt ', 12, 4, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 4, 'ascii');
  buffer.writeUInt32LE(pcmLength, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + index * 2);
  }

  return buffer;
}

export function createToneWave(durationSec, options = {}) {
  const sampleRate = options.sampleRate || 32000;
  const frequency = options.frequency || 220;
  const volume = options.volume || 0.18;
  const frameCount = Math.max(1, Math.round(durationSec * sampleRate));
  const samples = new Float32Array(frameCount);

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.min(1, index / (sampleRate * 0.04), (frameCount - index) / (sampleRate * 0.05));
    samples[index] = Math.sin(2 * Math.PI * frequency * time) * volume * Math.max(0, envelope);
  }

  return encodeWave16(samples, sampleRate);
}
