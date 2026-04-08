import { startLocalProviderServer } from '../server.mjs';
import { startMockCosyVoiceServer } from './mock-cosyvoice-server.mjs';

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  process.env.LOCAL_PROVIDER_PORT = process.env.LOCAL_PROVIDER_PORT || '18000';
  process.env.LOCAL_PROVIDER_RESPONSE_MODE = 'async';
  process.env.COSYVOICE_BASE_URL = process.env.COSYVOICE_BASE_URL || 'http://127.0.0.1:9880';

  const mockServer = startMockCosyVoiceServer();
  const providerServer = startLocalProviderServer();
  await wait(200);

  const createResponse = await fetch(`http://127.0.0.1:${process.env.LOCAL_PROVIDER_PORT}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      timingSource: 'subtitle',
      asrEnabled: false,
      provider: {
        type: 'localhost',
        translationModel: 'qwen-local',
        ttsModel: 'cosyvoice-v2',
        voicePreset: 'demo',
      },
      subtitles: {
        trackId: 'zh',
        label: 'Chinese',
        language: 'zh',
        cues: [
          { start: 0.2, end: 1.8, text: '这是第一句中文字幕。' },
          { start: 2.1, end: 3.6, text: '这里是第二句，用于验证本地 provider。' },
        ],
      },
    }),
  });

  if (!createResponse.ok) {
    throw new Error(`POST /jobs failed with ${createResponse.status}`);
  }

  const created = await createResponse.json();
  if (!created.jobId || !created.pollUrl) {
    throw new Error('missing job envelope');
  }

  let finalPayload = created;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(200);
    const pollResponse = await fetch(created.pollUrl);
    finalPayload = await pollResponse.json();
    if (finalPayload.status === 'done') {
      break;
    }
    if (finalPayload.status === 'failed') {
      throw new Error(finalPayload.error?.message || 'job failed');
    }
  }

  if (finalPayload.status !== 'done' || !finalPayload.result?.audioUrl) {
    throw new Error('job did not complete');
  }

  const audioResponse = await fetch(finalPayload.result.audioUrl, {
    headers: {
      Range: 'bytes=0-31',
    },
  });
  if (audioResponse.status !== 206) {
    throw new Error(`audio range request failed: ${audioResponse.status}`);
  }

  const subtitleResponse = await fetch(finalPayload.result.subtitleUrl);
  const subtitleText = await subtitleResponse.text();
  if (!subtitleText.includes('WEBVTT')) {
    throw new Error('subtitle file not generated');
  }

  mockServer.close();
  providerServer.close();
  console.log(JSON.stringify({ ok: true, jobId: finalPayload.jobId, audioUrl: finalPayload.result.audioUrl }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
