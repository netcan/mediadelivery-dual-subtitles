import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJobStore } from './lib/job-store.mjs';
import { processDubbingJob } from './lib/provider-job.mjs';
import { ValidationError, NotFoundError } from './lib/errors.mjs';
import {
  deriveBaseUrl,
  readJsonBody,
  resolveResponseMode,
  sendError,
  sendJson,
  serveStaticFile,
  withCorsHeaders,
} from './lib/http.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getConfig() {
  const port = Number(process.env.LOCAL_PROVIDER_PORT || process.env.PORT || 8000);
  return {
    host: process.env.LOCAL_PROVIDER_HOST || '127.0.0.1',
    port: Number.isFinite(port) && port > 0 ? port : 8000,
    publicBaseUrl: process.env.LOCAL_PROVIDER_BASE_URL || '',
    responseMode: process.env.LOCAL_PROVIDER_RESPONSE_MODE === 'sync' ? 'sync' : 'async',
    outputDir: process.env.LOCAL_PROVIDER_OUTPUT_DIR || path.join(__dirname, 'output'),
    adapterName: process.env.LOCAL_TTS_ADAPTER || '',
    cosyVoiceBaseUrl: process.env.COSYVOICE_BASE_URL || 'http://127.0.0.1:9880',
    cosyVoicePath: process.env.COSYVOICE_SYNTHESIS_PATH || '/v1/tts',
    cosyVoiceApiKey: process.env.COSYVOICE_API_KEY || '',
    defaultTtsModel: process.env.LOCAL_PROVIDER_DEFAULT_TTS_MODEL || 'cosyvoice-v2',
    defaultVoicePreset: process.env.LOCAL_PROVIDER_DEFAULT_VOICE || '',
    modelTimeoutMs: Number(process.env.LOCAL_PROVIDER_MODEL_TIMEOUT_MS || 120000),
    outputSampleRate: Number(process.env.LOCAL_PROVIDER_OUTPUT_SAMPLE_RATE || 32000),
    outputTailPadSec: Number(process.env.LOCAL_PROVIDER_OUTPUT_TAIL_PAD_SEC || 0.25),
  };
}

function validateCreateJobPayload(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('请求体必须是对象。');
  }

  if (!body.provider || typeof body.provider !== 'object') {
    throw new ValidationError('缺少 provider 配置。');
  }

  if (typeof body.provider.ttsModel !== 'string' || !body.provider.ttsModel.trim()) {
    throw new ValidationError('缺少 provider.ttsModel。');
  }

  if (typeof body.provider.translationModel !== 'string' || !body.provider.translationModel.trim()) {
    throw new ValidationError('缺少 provider.translationModel。');
  }

  if (!body.subtitles || typeof body.subtitles !== 'object') {
    throw new ValidationError('缺少 subtitles 对象。');
  }

  if (!Array.isArray(body.subtitles.cues) || !body.subtitles.cues.length) {
    throw new ValidationError('subtitles.cues 不能为空。');
  }

  return body;
}

export function createLocalProviderServer(config = getConfig()) {
  const store = createJobStore();

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host || `${config.host}:${config.port}`}`);

      if (request.method === 'OPTIONS') {
        response.writeHead(204, withCorsHeaders());
        response.end();
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/health') {
        sendJson(response, 200, {
          ok: true,
          adapter: 'cosyvoice',
          responseMode: config.responseMode,
          outputDir: config.outputDir,
        });
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/jobs') {
        const body = validateCreateJobPayload(await readJsonBody(request));
        const baseUrl = deriveBaseUrl(request, config);
        const responseMode = resolveResponseMode(request, config);
        const job = store.createJob({
          request: body,
          baseUrl,
          responseMode,
        });

        if (responseMode === 'sync') {
          try {
            await processDubbingJob(job, config, store);
          } catch {
            sendJson(response, 200, store.toEnvelope(store.getJob(job.id)));
            return;
          }
          sendJson(response, 200, store.toEnvelope(store.getJob(job.id)));
          return;
        }

        sendJson(response, 202, store.toEnvelope(job));
        queueMicrotask(() => {
          processDubbingJob(job, config, store).catch((error) => {
            console.error(`[local-provider] job ${job.id} failed`, error);
          });
        });
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname.startsWith('/jobs/')) {
        const jobId = decodeURIComponent(requestUrl.pathname.slice('/jobs/'.length));
        const job = store.getJob(jobId);
        if (!job) {
          throw new NotFoundError(`任务不存在：${jobId}`);
        }
        sendJson(response, 200, store.toEnvelope(job));
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname.startsWith('/files/')) {
        const fileName = requestUrl.pathname.slice('/files/'.length);
        await serveStaticFile(request, response, config.outputDir, fileName);
        return;
      }

      throw new NotFoundError(`未找到路由：${request.method} ${requestUrl.pathname}`);
    } catch (error) {
      sendError(response, error);
    }
  });

  return {
    server,
    config,
  };
}

export function startLocalProviderServer(config = getConfig()) {
  const { server } = createLocalProviderServer(config);
  server.listen(config.port, config.host, () => {
    console.log(
      `[local-provider] listening on http://${config.host}:${config.port} using cosyvoice adapter -> ${config.cosyVoiceBaseUrl}${config.cosyVoicePath}`
    );
  });
  return server;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  startLocalProviderServer();
}
