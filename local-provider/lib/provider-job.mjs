import fs from 'node:fs/promises';
import path from 'node:path';
import { buildSynthesisSegments, buildSubtitleOutputCues } from './preprocess.mjs';
import { buildVtt } from './subtitles.mjs';
import { createTtsAdapter } from './tts-adapters/index.mjs';
import { decodeWaveToMonoFloat32, encodeWave16, mixTimeline } from './wav.mjs';
import { ValidationError, toErrorEnvelope } from './errors.mjs';

function sanitizeFileName(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function processDubbingJob(job, config, store) {
  store.updateJob(job.id, {
    status: 'running',
    error: null,
  });

  try {
    const cues = job.request?.subtitles?.cues;
    const segments = buildSynthesisSegments(cues);
    const subtitleCues = buildSubtitleOutputCues(cues);
    const adapter = createTtsAdapter(config, job.request.provider);
    const renderedSegments = [];

    for (const segment of segments) {
      const synthesis = await adapter.synthesize({
        text: segment.text,
        model: job.request?.provider?.ttsModel,
        voicePreset: job.request?.provider?.voicePreset,
        language: job.request?.targetLanguage || 'zh',
      });

      const audio = decodeWaveToMonoFloat32(synthesis.audioBuffer);
      renderedSegments.push({
        start: segment.start,
        end: segment.end,
        text: segment.text,
        cueCount: segment.cueCount,
        sampleRate: audio.sampleRate,
        samples: audio.samples,
      });
    }

    if (!renderedSegments.length) {
      throw new ValidationError('未生成任何可写入的配音音频。');
    }

    const mixed = mixTimeline(renderedSegments, {
      sampleRate: config.outputSampleRate,
      tailPadSec: config.outputTailPadSec,
    });

    const fileBaseName = sanitizeFileName(job.id);
    const audioFileName = `${fileBaseName}.wav`;
    const subtitleFileName = `${fileBaseName}.vtt`;
    const audioFilePath = path.join(config.outputDir, audioFileName);
    const subtitleFilePath = path.join(config.outputDir, subtitleFileName);

    await fs.mkdir(config.outputDir, { recursive: true });
    await fs.writeFile(audioFilePath, encodeWave16(mixed.samples, mixed.sampleRate));
    await fs.writeFile(subtitleFilePath, buildVtt(subtitleCues), 'utf8');

    const result = {
      jobId: job.id,
      audioUrl: `${job.baseUrl}/files/${encodeURIComponent(audioFileName)}`,
      subtitleUrl: `${job.baseUrl}/files/${encodeURIComponent(subtitleFileName)}`,
      segments: renderedSegments.map((segment) => ({
        start: segment.start,
        end: segment.end,
        text: segment.text,
        cueCount: segment.cueCount,
        audioDurationSec: Number((segment.samples.length / segment.sampleRate).toFixed(3)),
      })),
      audioOffsetSec: 0,
    };

    store.updateJob(job.id, {
      status: 'done',
      result,
      error: null,
    });

    return result;
  } catch (error) {
    store.updateJob(job.id, {
      status: 'failed',
      error: toErrorEnvelope(error),
    });
    throw error;
  }
}
