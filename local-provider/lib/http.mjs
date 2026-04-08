import fs from 'node:fs/promises';
import path from 'node:path';
import { NotFoundError, ValidationError, toErrorEnvelope } from './errors.mjs';

const MIME_TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.wav': 'audio/wav',
};

export function withCorsHeaders(headers = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    ...headers,
  };
}

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, withCorsHeaders({ 'Content-Type': 'application/json; charset=utf-8' }));
  response.end(JSON.stringify(payload, null, 2));
}

export function sendError(response, error) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  sendJson(response, statusCode, {
    status: 'failed',
    error: toErrorEnvelope(error),
  });
}

export async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();
  if (!rawBody) {
    throw new ValidationError('请求体不能为空。');
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new ValidationError('请求体不是合法 JSON。');
  }
}

export function deriveBaseUrl(request, config) {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl.replace(/\/$/, '');
  }

  const host = request.headers.host || `127.0.0.1:${config.port}`;
  const protocolHeader = request.headers['x-forwarded-proto'];
  const protocol = typeof protocolHeader === 'string' && protocolHeader ? protocolHeader.split(',')[0] : 'http';
  return `${protocol}://${host}`.replace(/\/$/, '');
}

export function resolveResponseMode(request, config) {
  const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
  const requestedMode = url.searchParams.get('mode');
  if (requestedMode === 'sync' || requestedMode === 'async') {
    return requestedMode;
  }
  return config.responseMode;
}

export async function serveStaticFile(request, response, outputDir, name) {
  const decodedName = decodeURIComponent(name);
  const filePath = path.resolve(outputDir, decodedName);
  const rootPath = path.resolve(outputDir);
  if (!filePath.startsWith(rootPath + path.sep) && filePath !== rootPath) {
    throw new ValidationError('文件路径非法。', { statusCode: 403 });
  }

  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    throw new NotFoundError(`文件不存在：${decodedName}`);
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || 'application/octet-stream';
  const range = request.headers.range;

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (!match) {
      throw new ValidationError('Range 请求格式无效。', { statusCode: 416 });
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stat.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= stat.size || start > end) {
      throw new ValidationError('Range 超出文件范围。', { statusCode: 416 });
    }

    const handle = await fs.open(filePath, 'r');
    try {
      const length = end - start + 1;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, start);
      response.writeHead(
        206,
        withCorsHeaders({
          'Content-Type': contentType,
          'Content-Length': length,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
        })
      );
      response.end(buffer);
    } finally {
      await handle.close();
    }
    return;
  }

  const buffer = await fs.readFile(filePath);
  response.writeHead(
    200,
    withCorsHeaders({
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    })
  );
  response.end(buffer);
}
