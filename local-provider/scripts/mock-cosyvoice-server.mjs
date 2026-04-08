import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createToneWave } from '../lib/wav.mjs';

export function startMockCosyVoiceServer(options = {}) {
  const host = options.host || process.env.MOCK_COSYVOICE_HOST || '127.0.0.1';
  const port = Number(options.port || process.env.MOCK_COSYVOICE_PORT || 9880);

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);

    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/v1/tts') {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const text = String(body.text || '').trim();
      const durationSec = Math.min(5, Math.max(0.5, text.length * 0.12));
      const audioBuffer = createToneWave(durationSec, {
        sampleRate: 32000,
        frequency: 180 + (text.length % 5) * 40,
      });
      response.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': audioBuffer.length,
      });
      response.end(audioBuffer);
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: { message: 'not found' } }));
  });

  server.listen(port, host, () => {
    console.log(`[mock-cosyvoice] listening on http://${host}:${port}`);
  });

  return server;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  startMockCosyVoiceServer();
}
