import { ModelInvokeError, ModelUnavailableError } from '../errors.mjs';

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ModelUnavailableError(`本地 CosyVoice 服务超时（>${timeoutMs}ms）。`);
    }
    throw new ModelUnavailableError(`无法连接本地 CosyVoice 服务：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function readAudioPayload(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.startsWith('audio/')) {
    return Buffer.from(await response.arrayBuffer());
  }

  const payload = await response.json().catch(() => null);
  const source = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  if (!source || typeof source !== 'object') {
    throw new ModelInvokeError('CosyVoice 返回了无法识别的响应结构。');
  }

  const audioUrl = firstDefined(source.audioUrl, source.audio_url, source.url, source.fileUrl);
  if (audioUrl) {
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new ModelInvokeError(`CosyVoice 返回的音频地址不可用（HTTP ${audioResponse.status}）。`);
    }
    return Buffer.from(await audioResponse.arrayBuffer());
  }

  const base64Value = firstDefined(source.audioBase64, source.audio_base64, source.base64, source.audio);
  if (typeof base64Value === 'string' && base64Value.trim()) {
    return Buffer.from(base64Value.trim(), 'base64');
  }

  throw new ModelInvokeError('CosyVoice 未返回可用音频内容。');
}

export class CosyVoiceAdapter {
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.path = config.path || '/v1/tts';
    this.timeoutMs = config.timeoutMs || 120000;
    this.apiKey = config.apiKey || '';
    this.defaultVoice = config.defaultVoice || '';
    this.defaultModel = config.defaultModel || '';
    this.defaultFormat = config.defaultFormat || 'wav';
  }

  async synthesize(input) {
    const endpoint = `${this.baseUrl}${this.path.startsWith('/') ? this.path : `/${this.path}`}`;
    const payload = {
      text: input.text,
      model: input.model || this.defaultModel,
      voice: input.voicePreset || this.defaultVoice,
      speaker: input.voicePreset || this.defaultVoice,
      format: this.defaultFormat,
      stream: false,
      language: input.language || 'zh',
    };

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'audio/wav, application/json',
    };

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      },
      this.timeoutMs
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new ModelInvokeError(`CosyVoice 合成失败（HTTP ${response.status}）：${errorText || response.statusText || 'unknown error'}`);
    }

    return {
      audioBuffer: await readAudioPayload(response),
      mimeType: 'audio/wav',
    };
  }
}
