import { ValidationError } from '../errors.mjs';
import { CosyVoiceAdapter } from './cosyvoice.mjs';

function inferAdapterName(modelName) {
  const normalized = String(modelName || '').toLowerCase();
  if (!normalized || normalized.includes('cosy') || normalized.includes('cosyvoice')) {
    return 'cosyvoice';
  }
  return normalized;
}

export function createTtsAdapter(config, requestProvider = {}) {
  const requestedModel = requestProvider.ttsModel || '';
  const adapterName = inferAdapterName(config.adapterName || requestedModel);
  if (adapterName !== 'cosyvoice') {
    throw new ValidationError(`当前仅内置 cosyvoice 适配器，收到模型：${requestedModel || adapterName}`);
  }

  return new CosyVoiceAdapter({
    baseUrl: config.cosyVoiceBaseUrl,
    path: config.cosyVoicePath,
    timeoutMs: config.modelTimeoutMs,
    apiKey: config.cosyVoiceApiKey,
    defaultVoice: requestProvider.voicePreset || config.defaultVoicePreset,
    defaultModel: requestedModel || config.defaultTtsModel,
    defaultFormat: 'wav',
  });
}
