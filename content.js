(function () {
  'use strict';

  const isEmbedPage = /(^|\.)mediadelivery\.net$/.test(location.hostname) && location.pathname.startsWith('/embed/');

  if (!isEmbedPage) {
    return;
  }

  const STORAGE_KEY = 'btc-bilingual-subtitles-settings';
  const IMPORTED_TRACK_ID = 'imported-local';
  const DUBBED_TRACK_ID = 'dubbed-generated';
  const DUB_POLL_INTERVAL_MS = 3000;
  const DUB_SYNC_INTERVAL_MS = 900;
  const DUB_SYNC_THRESHOLD_SEC = 0.35;

  const DEFAULT_PROVIDER = {
    type: 'custom',
    baseUrl: '',
    apiKey: '',
    translationModel: '',
    ttsModel: '',
    voicePreset: '',
  };

  const DEFAULT_DUBBING = {
    enabled: false,
    jobId: '',
    pollUrl: '',
    status: 'idle',
    lastError: '',
    result: null,
    subtitleMode: 'original',
    timingSource: 'subtitle',
  };

  const state = {
    video: null,
    container: null,
    overlay: null,
    primaryLine: null,
    secondaryLine: null,
    panel: null,
    primarySelect: null,
    secondarySelect: null,
    enabledCheckbox: null,
    importInput: null,
    providerTypeSelect: null,
    providerBaseUrlInput: null,
    providerApiKeyInput: null,
    providerTranslationModelInput: null,
    providerTtsModelInput: null,
    providerVoicePresetInput: null,
    dubbingEnabledCheckbox: null,
    dubbingSubtitleModeSelect: null,
    dubbingGenerateButton: null,
    dubbingRefreshButton: null,
    dubbingStatus: null,
    tracks: [],
    importedTrack: null,
    dubbedSubtitleTrack: null,
    trackCache: new Map(),
    settings: normalizeSettings(loadSettings()),
    renderTimer: null,
    pollTimer: null,
    dubSyncTimer: null,
    dubbedAudio: null,
    savedVideoAudioState: null,
  };

  const style = document.createElement('style');
  style.textContent = `
    #btc-bilingual-root {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483647;
      font-family: Arial, sans-serif;
    }

    #btc-bilingual-overlay.btc-hidden {
      display: none;
    }

    #btc-bilingual-overlay {
      position: absolute;
      left: 50%;
      bottom: 9%;
      transform: translateX(-50%);
      width: min(92%, 980px);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-shadow: 0 2px 6px rgba(0, 0, 0, 0.95);
    }

    .btc-sub-line {
      display: block;
      max-width: 100%;
      margin: 4px auto;
      padding: 6px 12px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.58);
      color: #fff;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 26px;
      font-weight: 600;
    }

    .btc-sub-line.secondary {
      color: #7fd0ff;
      font-size: 24px;
      font-weight: 500;
    }

    #btc-bilingual-toggle {
      position: fixed;
      top: 12px;
      right: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: auto;
    }

    #btc-bilingual-toggle button {
      border: 0;
      border-radius: 999px;
      padding: 8px 12px;
      background: rgba(3, 16, 32, 0.82);
      color: #fff;
      font-size: 13px;
      cursor: pointer;
    }

    #btc-bilingual-panel {
      position: fixed;
      top: 56px;
      right: 12px;
      width: 320px;
      max-height: min(78vh, 760px);
      overflow-y: auto;
      padding: 12px;
      border-radius: 12px;
      background: rgba(4, 17, 34, 0.92);
      color: #fff;
      font-size: 13px;
      line-height: 1.5;
      box-shadow: 0 10px 32px rgba(0, 0, 0, 0.35);
      pointer-events: auto;
    }

    #btc-bilingual-panel[hidden] {
      display: none;
    }

    #btc-bilingual-panel label {
      display: block;
      margin: 10px 0 4px;
      color: #cfe0ff;
    }

    #btc-bilingual-panel select,
    #btc-bilingual-panel input[type="file"],
    #btc-bilingual-panel input[type="text"],
    #btc-bilingual-panel input[type="password"] {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid rgba(127, 208, 255, 0.22);
      border-radius: 8px;
      padding: 8px 10px;
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }

    #btc-bilingual-panel input[type="checkbox"] {
      margin-right: 8px;
    }

    #btc-bilingual-panel .btc-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }

    #btc-bilingual-panel .btc-section {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid rgba(127, 208, 255, 0.18);
    }

    #btc-bilingual-panel .btc-section-title {
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 700;
      color: #fff;
    }

    #btc-bilingual-panel .btc-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }

    #btc-bilingual-panel .btc-actions button {
      flex: 1 1 0;
      border: 1px solid rgba(127, 208, 255, 0.22);
      border-radius: 8px;
      padding: 8px 10px;
      background: rgba(127, 208, 255, 0.12);
      color: #fff;
      cursor: pointer;
    }

    #btc-bilingual-panel .btc-actions button[disabled] {
      cursor: not-allowed;
      opacity: 0.55;
    }

    #btc-bilingual-panel .btc-status {
      margin-top: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
      color: #dfe9ff;
      white-space: pre-wrap;
      word-break: break-word;
    }

    #btc-bilingual-panel .btc-status.is-error {
      background: rgba(255, 77, 79, 0.14);
      color: #ffd0d0;
    }

    #btc-bilingual-panel .btc-note {
      margin-top: 10px;
      color: #a9bddf;
      font-size: 12px;
    }

    .plyr__captions {
      display: none !important;
    }
  `;
  document.documentElement.appendChild(style);

  waitForVideo();

  function waitForVideo() {
    const boot = () => {
      const video = document.querySelector('video');
      if (!video) {
        return false;
      }
      initialize(video);
      return true;
    };

    if (boot()) {
      return;
    }

    const observer = new MutationObserver(() => {
      if (boot()) {
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function initialize(video) {
    if (state.video === video) {
      return;
    }

    state.video = video;
    state.container = document.querySelector('#video-container') || video.parentElement || document.body;

    createUI();
    hydratePanel();
    syncOverlayMount();
    void refreshTracks(true);
    void restorePersistedDubbing();

    video.addEventListener('loadedmetadata', () => {
      void refreshTracks(true);
      void syncDubbingPlayback(true);
    });
    video.addEventListener('seeked', () => {
      renderSubtitles();
      void syncDubbingPlayback(true);
    });
    video.addEventListener('play', () => {
      renderSubtitles();
      void syncDubbingPlayback(false);
    });
    video.addEventListener('pause', () => void syncDubbingPlayback(false));
    video.addEventListener('ratechange', () => void syncDubbingPlayback(true));
    video.addEventListener('ended', () => void syncDubbingPlayback(true));
    video.addEventListener('timeupdate', () => {
      renderSubtitles();
      syncDubbedAudioDrift();
    });
    document.addEventListener('fullscreenchange', syncOverlayMount);
    document.addEventListener('webkitfullscreenchange', syncOverlayMount);

    state.renderTimer = window.setInterval(() => {
      void refreshTracks(false);
      renderSubtitles();
    }, 600);

    state.dubSyncTimer = window.setInterval(() => {
      syncDubbedAudioDrift();
    }, DUB_SYNC_INTERVAL_MS);
  }

  function createUI() {
    if (state.overlay) {
      return;
    }

    const root = document.createElement('div');
    root.id = 'btc-bilingual-root';
    root.innerHTML = `
      <div id="btc-bilingual-overlay">
        <div class="btc-sub-line primary"></div>
        <div class="btc-sub-line secondary"></div>
      </div>
      <div id="btc-bilingual-toggle">
        <button type="button">双语字幕</button>
      </div>
      <div id="btc-bilingual-panel" hidden>
        <div class="btc-row">
          <label><input type="checkbox" id="btc-enabled">启用双语字幕</label>
        </div>
        <label for="btc-primary">主字幕</label>
        <select id="btc-primary"></select>
        <label for="btc-secondary">副字幕</label>
        <select id="btc-secondary"></select>
        <label for="btc-import">导入本地字幕（SRT / VTT）</label>
        <input id="btc-import" type="file" accept=".srt,.vtt,text/vtt,application/x-subrip">
        <div class="btc-note">默认优先选择 English + Chinese。若站点没给中文轨，可导入你自己的中文字幕文件。</div>

        <div class="btc-section">
          <div class="btc-section-title">模型 Provider</div>
          <label for="btc-provider-type">Provider 类型</label>
          <select id="btc-provider-type">
            <option value="custom">自定义 HTTP API</option>
            <option value="openai-compatible">OpenAI-compatible</option>
            <option value="localhost">本地 localhost 服务</option>
            <option value="cloud">云端托管 API</option>
          </select>
          <label for="btc-provider-base-url">Base URL</label>
          <input id="btc-provider-base-url" type="text" placeholder="例如 http://127.0.0.1:8000">
          <label for="btc-provider-api-key">API Key / Token</label>
          <input id="btc-provider-api-key" type="password" placeholder="按 Provider 需要填写">
          <label for="btc-provider-translation-model">翻译模型</label>
          <input id="btc-provider-translation-model" type="text" placeholder="例如 qwen-plus">
          <label for="btc-provider-tts-model">TTS / 配音模型</label>
          <input id="btc-provider-tts-model" type="text" placeholder="例如 cosyvoice-v2">
          <label for="btc-provider-voice-preset">音色 / Voice Preset（可选）</label>
          <input id="btc-provider-voice-preset" type="text" placeholder="例如 female-natural-1">
        </div>

        <div class="btc-section">
          <div class="btc-section-title">中文配音</div>
          <div class="btc-row">
            <label><input type="checkbox" id="btc-dubbing-enabled">启用中文配音</label>
          </div>
          <label for="btc-dubbing-subtitle-mode">中文字幕来源</label>
          <select id="btc-dubbing-subtitle-mode">
            <option value="original">优先原中文字幕</option>
            <option value="generated">优先配音结果字幕</option>
          </select>
          <div class="btc-actions">
            <button type="button" id="btc-dubbing-generate">生成中文配音</button>
            <button type="button" id="btc-dubbing-refresh">刷新状态</button>
          </div>
          <div id="btc-dubbing-status" class="btc-status">尚未生成中文配音。</div>
          <div class="btc-note">首期使用现有中文字幕驱动配音生成；ASR 作为后续扩展预留。</div>
        </div>
      </div>
    `;

    getOverlayMountTarget().appendChild(root);
    state.overlay = root;
    state.primaryLine = root.querySelector('.btc-sub-line.primary');
    state.secondaryLine = root.querySelector('.btc-sub-line.secondary');
    state.panel = root.querySelector('#btc-bilingual-panel');
    state.primarySelect = root.querySelector('#btc-primary');
    state.secondarySelect = root.querySelector('#btc-secondary');
    state.enabledCheckbox = root.querySelector('#btc-enabled');
    state.importInput = root.querySelector('#btc-import');
    state.providerTypeSelect = root.querySelector('#btc-provider-type');
    state.providerBaseUrlInput = root.querySelector('#btc-provider-base-url');
    state.providerApiKeyInput = root.querySelector('#btc-provider-api-key');
    state.providerTranslationModelInput = root.querySelector('#btc-provider-translation-model');
    state.providerTtsModelInput = root.querySelector('#btc-provider-tts-model');
    state.providerVoicePresetInput = root.querySelector('#btc-provider-voice-preset');
    state.dubbingEnabledCheckbox = root.querySelector('#btc-dubbing-enabled');
    state.dubbingSubtitleModeSelect = root.querySelector('#btc-dubbing-subtitle-mode');
    state.dubbingGenerateButton = root.querySelector('#btc-dubbing-generate');
    state.dubbingRefreshButton = root.querySelector('#btc-dubbing-refresh');
    state.dubbingStatus = root.querySelector('#btc-dubbing-status');

    root.querySelector('button').addEventListener('click', () => {
      state.panel.hidden = !state.panel.hidden;
    });

    state.enabledCheckbox.addEventListener('change', () => {
      state.settings.enabled = state.enabledCheckbox.checked;
      saveSettings();
      renderSubtitles();
    });

    state.primarySelect.addEventListener('change', () => {
      state.settings.primary = state.primarySelect.value;
      if (state.settings.primary === state.settings.secondary) {
        state.settings.secondary = '';
      }
      saveSettings();
      void refreshTracks(false);
      renderSubtitles();
    });

    state.secondarySelect.addEventListener('change', () => {
      state.settings.secondary = state.secondarySelect.value;
      if (state.settings.primary === state.settings.secondary) {
        state.settings.primary = '';
      }
      if (state.secondarySelect.value === DUBBED_TRACK_ID) {
        state.settings.dubbing.subtitleMode = 'generated';
        state.dubbingSubtitleModeSelect.value = 'generated';
      } else if (state.settings.dubbing.subtitleMode === 'generated') {
        state.settings.dubbing.subtitleMode = 'original';
        state.dubbingSubtitleModeSelect.value = 'original';
      }
      saveSettings();
      void refreshTracks(false);
      renderSubtitles();
    });

    state.importInput.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }
      const text = await file.text();
      const cues = parseSubtitleFile(text);
      if (!cues.length) {
        setDubbingStatus('error', '导入的字幕文件无法解析，请检查 SRT / VTT 格式。');
        return;
      }
      state.importedTrack = {
        id: IMPORTED_TRACK_ID,
        label: `Local: ${file.name}`,
        kind: 'imported',
        lang: detectLanguage(file.name),
        cues,
      };
      state.settings.secondary = IMPORTED_TRACK_ID;
      saveSettings();
      await refreshTracks(false);
      renderSubtitles();
    });

    for (const element of [
      state.providerTypeSelect,
      state.providerBaseUrlInput,
      state.providerApiKeyInput,
      state.providerTranslationModelInput,
      state.providerTtsModelInput,
      state.providerVoicePresetInput,
    ]) {
      element.addEventListener('change', handleProviderChange);
      element.addEventListener('input', handleProviderChange);
    }

    state.dubbingEnabledCheckbox.addEventListener('change', () => {
      state.settings.dubbing.enabled = state.dubbingEnabledCheckbox.checked;
      saveSettings();
      void syncDubbingPlayback(true);
      refreshDubbingControls();
    });

    state.dubbingSubtitleModeSelect.addEventListener('change', () => {
      state.settings.dubbing.subtitleMode = state.dubbingSubtitleModeSelect.value;
      saveSettings();
      void refreshTracks(false);
    });

    state.dubbingGenerateButton.addEventListener('click', () => {
      void startDubbingJob();
    });

    state.dubbingRefreshButton.addEventListener('click', () => {
      void refreshDubbingJob();
    });
  }

  function hydratePanel() {
    state.enabledCheckbox.checked = state.settings.enabled !== false;
    state.providerTypeSelect.value = state.settings.provider.type;
    state.providerBaseUrlInput.value = state.settings.provider.baseUrl;
    state.providerApiKeyInput.value = state.settings.provider.apiKey;
    state.providerTranslationModelInput.value = state.settings.provider.translationModel;
    state.providerTtsModelInput.value = state.settings.provider.ttsModel;
    state.providerVoicePresetInput.value = state.settings.provider.voicePreset;
    state.dubbingEnabledCheckbox.checked = state.settings.dubbing.enabled === true;
    state.dubbingSubtitleModeSelect.value = state.settings.dubbing.subtitleMode;
    setDubbingStatus(state.settings.dubbing.status, state.settings.dubbing.lastError || defaultStatusText(state.settings.dubbing.status));
    refreshDubbingControls();
  }

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function getOverlayMountTarget() {
    const fullscreenElement = getFullscreenElement();
    if (fullscreenElement && fullscreenElement.contains(state.video)) {
      return fullscreenElement;
    }
    return document.body;
  }

  function syncOverlayMount() {
    if (!state.overlay) {
      return;
    }

    const target = getOverlayMountTarget();
    if (state.overlay.parentElement !== target) {
      target.appendChild(state.overlay);
    }
  }

  async function refreshTracks(resetDefaults) {
    if (!state.video) {
      return;
    }

    const nativeTracks = await loadNativeTracks();
    state.tracks = nativeTracks;
    const combined = getCombinedTracks(nativeTracks);

    if (resetDefaults || !isTrackAvailable(state.settings.primary, combined)) {
      state.settings.primary = pickTrack(combined, ['en'])?.id || combined[0]?.id || '';
    }

    if (state.settings.dubbing.subtitleMode === 'generated' && isTrackAvailable(DUBBED_TRACK_ID, combined)) {
      if (state.settings.primary === DUBBED_TRACK_ID) {
        state.settings.primary = pickTrack(combined, ['en'], DUBBED_TRACK_ID)?.id || pickAnyOtherTrack(combined, DUBBED_TRACK_ID)?.id || '';
      }
      state.settings.secondary = DUBBED_TRACK_ID;
    } else if (
      resetDefaults ||
      !isTrackAvailable(state.settings.secondary, combined) ||
      state.settings.secondary === state.settings.primary
    ) {
      state.settings.secondary =
        pickTrack(combined, ['zh', 'cn', 'hk'], state.settings.primary, [DUBBED_TRACK_ID])?.id ||
        pickAnyOtherTrack(combined, state.settings.primary)?.id ||
        '';
    }

    applyTrackModes();
    renderOptions(combined);
    saveSettings();
    renderSubtitles();
    refreshDubbingControls();
  }

  function getCombinedTracks(nativeTracks = state.tracks) {
    const combined = [...nativeTracks];
    if (state.importedTrack) {
      combined.push(state.importedTrack);
    }
    if (state.dubbedSubtitleTrack) {
      combined.push(state.dubbedSubtitleTrack);
    }
    return combined;
  }

  function renderOptions(tracks) {
    const noneOption = '<option value="">None</option>';
    const markup = tracks
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(formatTrackLabel(item))}</option>`)
      .join('');
    state.primarySelect.innerHTML = noneOption + markup;
    state.secondarySelect.innerHTML = noneOption + markup;
    state.primarySelect.value = isTrackAvailable(state.settings.primary, tracks) ? state.settings.primary : '';
    state.secondarySelect.value = isTrackAvailable(state.settings.secondary, tracks) ? state.settings.secondary : '';
  }

  function applyTrackModes() {
    for (const track of Array.from(state.video?.textTracks || [])) {
      track.mode = 'disabled';
    }
  }

  function renderSubtitles() {
    const enabled = state.settings.enabled !== false;
    const overlayBox = state.overlay.querySelector('#btc-bilingual-overlay');
    overlayBox.classList.toggle('btc-hidden', !enabled);
    if (!enabled) {
      state.primaryLine.textContent = '';
      state.secondaryLine.textContent = '';
      return;
    }

    const primary = resolveTrack(state.settings.primary);
    const secondary = resolveTrack(state.settings.secondary);
    const primaryText = readTrackText(primary);
    const secondaryText = secondary && secondary.id !== primary?.id ? readTrackText(secondary) : '';

    state.primaryLine.textContent = primaryText || '';
    state.secondaryLine.textContent = secondaryText || '';
    state.primaryLine.style.display = primaryText ? 'inline-block' : 'none';
    state.secondaryLine.style.display = secondaryText ? 'inline-block' : 'none';
  }

  function resolveTrack(id) {
    if (!id) {
      return null;
    }
    return getCombinedTracks().find((item) => item.id === id) || null;
  }

  function readTrackText(item) {
    if (!item) {
      return '';
    }

    if (item.kind === 'imported' || item.kind === 'native-parsed') {
      return getImportedText(item.cues, state.video.currentTime);
    }

    const activeCues = item.track?.activeCues ? Array.from(item.track.activeCues) : [];
    if (activeCues.length) {
      return compactCueSegments(activeCues.map((cue) => normalizeCueText(cue.text)));
    }

    const cues = item.track?.cues ? Array.from(item.track.cues) : [];
    const currentCue = cues.find((cue) => cue.startTime <= state.video.currentTime && state.video.currentTime < cue.endTime);
    return currentCue ? normalizeCueText(currentCue.text) : '';
  }

  async function loadNativeTracks() {
    const textTracks = Array.from(state.video.textTracks || []);
    const trackElements = Array.from(state.video.querySelectorAll('track'));
    const loaded = [];

    for (const [index, element] of trackElements.entries()) {
      const src = element.getAttribute('src') || element.src || '';
      const label = element.label || element.getAttribute('label') || fallbackElementLabel(element, index);
      const lang = detectLanguage(`${element.srclang || ''} ${label}`);
      const trackRef = textTracks[index];

      if (!src) {
        loaded.push({
          id: `native-fallback-${index}`,
          kind: 'native-fallback',
          track: trackRef,
          label,
          lang,
        });
        continue;
      }

      const cacheKey = `${src}::${label}`;
      let entry = state.trackCache.get(cacheKey);
      if (!entry) {
        entry = await fetchTrackFile(src, {
          id: `native-${index}`,
          label,
          lang,
          track: trackRef,
        });
        state.trackCache.set(cacheKey, entry);
      } else if (!entry.track && trackRef) {
        entry.track = trackRef;
      }

      loaded.push(entry);
    }

    if (!loaded.length) {
      return textTracks.map((track, index) => ({
        id: `native-fallback-${index}`,
        kind: 'native-fallback',
        track,
        label: track.label || fallbackTrackLabel(track, index),
        lang: detectLanguage(`${track.language || ''} ${track.label || ''}`),
      }));
    }

    return loaded;
  }

  async function fetchTrackFile(src, base) {
    try {
      const text = await fetchTextViaExtension(src);
      const cues = parseSubtitleFile(text);
      if (cues.length) {
        return {
          ...base,
          kind: 'native-parsed',
          src,
          cues,
        };
      }
    } catch (error) {
      console.debug('btc bilingual: failed to load track', src, error);
    }

    return {
      ...base,
      kind: 'native-fallback',
      src,
    };
  }

  async function fetchTextViaExtension(url) {
    if (chrome?.runtime?.id) {
      const response = await chrome.runtime.sendMessage({ type: 'fetchText', url });
      if (response?.ok) {
        return response.text;
      }
      if (response?.error) {
        throw new Error(response.error);
      }
    }

    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  }

  async function requestJsonViaExtension(url, options = {}) {
    const response = await chrome.runtime.sendMessage({
      type: 'httpRequest',
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || '',
    });

    if (!response) {
      throw new Error('未收到扩展后台响应。');
    }

    if (!response.ok) {
      const message = extractResponseError(response);
      throw new Error(message || `请求失败（HTTP ${response.status || 'unknown'}）`);
    }

    if (response.json !== null && response.json !== undefined) {
      return response.json;
    }

    if (response.text) {
      try {
        return JSON.parse(response.text);
      } catch {
        return { text: response.text };
      }
    }

    return {};
  }

  function extractResponseError(response) {
    if (!response) {
      return '请求失败。';
    }
    if (response.error) {
      return response.error;
    }
    const payload = response.json || safeParseJson(response.text);
    if (typeof payload === 'string') {
      return payload;
    }
    if (payload?.error?.message) {
      return payload.error.message;
    }
    if (payload?.error) {
      return String(payload.error);
    }
    if (payload?.message) {
      return String(payload.message);
    }
    if (response.status === 401 || response.status === 403) {
      return 'Provider 鉴权失败，请检查 API Key / Token。';
    }
    if (response.status === 404) {
      return '未找到 Provider 任务接口，请确认 Base URL 是否实现了 /jobs 契约。';
    }
    if (response.status >= 500) {
      return `Provider 服务异常（HTTP ${response.status}）。`;
    }
    return response.statusText || '';
  }

  function getImportedText(cues, currentTime) {
    const currentCue = cues.find((cue) => cue.start <= currentTime && currentTime < cue.end);
    return currentCue ? currentCue.text : '';
  }

  function parseSubtitleFile(text) {
    const normalized = text.replace(/\r/g, '').trim();
    if (!normalized) {
      return [];
    }

    const body = normalized.startsWith('WEBVTT') ? normalized.replace(/^WEBVTT.*?\n\n/s, '') : normalized;
    const blocks = body.split(/\n{2,}/);
    const cues = [];

    for (const block of blocks) {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (!lines.length) {
        continue;
      }

      const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
      if (timeLineIndex === -1) {
        continue;
      }

      const timeLine = lines[timeLineIndex];
      const textLines = lines.slice(timeLineIndex + 1);
      const [start, end] = timeLine.split('-->').map((part) => parseTime(part.trim().split(/\s+/)[0]));
      if (!Number.isFinite(start) || !Number.isFinite(end) || !textLines.length) {
        continue;
      }

      cues.push({
        start,
        end,
        text: compactCueSegments(textLines.map((line) => normalizeCueText(line))),
      });
    }

    return cues;
  }

  function parseTime(value) {
    const match = value.match(/(?:(\d+):)?(\d+):(\d+)[,.](\d+)/);
    if (!match) {
      return NaN;
    }
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    const millis = Number((match[4] || '0').padEnd(3, '0').slice(0, 3));
    return hours * 3600 + minutes * 60 + seconds + millis / 1000;
  }

  function normalizeCueText(text) {
    return text
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compactCueSegments(segments) {
    const parts = segments
      .flatMap((segment) => String(segment || '').split('\n'))
      .map((segment) => segment.trim())
      .filter(Boolean);

    return [...new Set(parts)].join(' ');
  }

  function pickTrack(tracks, languages, excludeId, excludedIds = []) {
    return tracks.find((track) => track.id !== excludeId && !excludedIds.includes(track.id) && languages.includes(track.lang));
  }

  function pickAnyOtherTrack(tracks, excludeId) {
    return tracks.find((track) => track.id !== excludeId);
  }

  function isTrackAvailable(id, tracks) {
    return Boolean(id && tracks.some((track) => track.id === id));
  }

  function formatTrackLabel(track) {
    const langName = languageName(track.lang);
    return langName && !track.label.toLowerCase().includes(langName.toLowerCase())
      ? `${track.label} (${langName})`
      : track.label;
  }

  function fallbackTrackLabel(track, index) {
    const lang = languageName(detectLanguage(track.language || '')) || `Track ${index + 1}`;
    return lang;
  }

  function fallbackElementLabel(element, index) {
    return languageName(detectLanguage(`${element.srclang || ''}`)) || `Track ${index + 1}`;
  }

  function detectLanguage(raw) {
    const value = String(raw || '').toLowerCase();
    if (/(^|[\s_-])(zh|cn|hk)([\s_-]|$)|chinese|中文|简体|繁體|繁体/.test(value)) {
      return 'zh';
    }
    if (/(^|[\s_-])en([\s_-]|$)|english/.test(value)) {
      return 'en';
    }
    if (/(^|[\s_-])es([\s_-]|$)|spanish|español/.test(value)) {
      return 'es';
    }
    if (/(^|[\s_-])pt([\s_-]|$)|portuguese|português/.test(value)) {
      return 'pt';
    }
    return '';
  }

  function languageName(code) {
    return {
      en: 'English',
      zh: 'Chinese',
      es: 'Spanish',
      pt: 'Portuguese',
    }[code] || '';
  }

  function handleProviderChange() {
    const nextType = state.providerTypeSelect.value;
    const provider = {
      type: nextType,
      baseUrl: state.providerBaseUrlInput.value.trim(),
      apiKey: state.providerApiKeyInput.value.trim(),
      translationModel: state.providerTranslationModelInput.value.trim(),
      ttsModel: state.providerTtsModelInput.value.trim(),
      voicePreset: state.providerVoicePresetInput.value.trim(),
    };

    if (!provider.baseUrl) {
      if (nextType === 'localhost') {
        provider.baseUrl = 'http://127.0.0.1:8000';
      } else if (nextType === 'openai-compatible') {
        provider.baseUrl = 'https://api.example.com/v1';
      }
    }

    state.settings.provider = normalizeProvider(provider);
    if (state.providerBaseUrlInput.value.trim() !== state.settings.provider.baseUrl) {
      state.providerBaseUrlInput.value = state.settings.provider.baseUrl;
    }
    saveSettings();
    refreshDubbingControls();
  }

  async function startDubbingJob() {
    const validation = validateProviderConfig(state.settings.provider);
    if (!validation.ok) {
      setDubbingStatus('error', validation.message);
      return;
    }

    const subtitlePayload = buildChineseSubtitlePayload();
    if (!subtitlePayload.ok) {
      setDubbingStatus('error', subtitlePayload.message);
      return;
    }

    const requestBody = {
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      timingSource: state.settings.dubbing.timingSource,
      asrEnabled: false,
      metadata: {
        pageUrl: location.href,
        title: document.title,
        videoSrc: state.video.currentSrc || state.video.src || '',
      },
      provider: {
        type: state.settings.provider.type,
        translationModel: state.settings.provider.translationModel,
        ttsModel: state.settings.provider.ttsModel,
        voicePreset: state.settings.provider.voicePreset,
      },
      subtitles: subtitlePayload.payload,
    };

    setDubbingStatus('running', '正在创建中文配音任务…');
    stopDubbingPolling();
    state.settings.dubbing.result = null;
    state.dubbedSubtitleTrack = null;

    try {
      const response = await requestJsonViaExtension(joinUrl(state.settings.provider.baseUrl, '/jobs'), {
        method: 'POST',
        headers: buildProviderHeaders(state.settings.provider),
        body: JSON.stringify(requestBody),
      });

      const normalized = normalizeJobEnvelope(response, state.settings.provider.baseUrl);
      if (normalized.result) {
        await applyDubbingResult(normalized.result);
        return;
      }

      if (!normalized.jobId && !normalized.pollUrl) {
        throw new Error('Provider 未返回任务 ID 或结果。请确认其实现了 /jobs 契约。');
      }

      state.settings.dubbing.jobId = normalized.jobId;
      state.settings.dubbing.pollUrl = normalized.pollUrl;
      state.settings.dubbing.status = normalized.status;
      state.settings.dubbing.lastError = '';
      saveSettings();
      setDubbingStatus(normalized.status, `任务已创建：${normalized.jobId || 'unknown'}\n等待 Provider 返回中文配音结果…`);
      refreshDubbingControls();
      scheduleDubbingPolling();
    } catch (error) {
      state.settings.dubbing.status = 'failed';
      state.settings.dubbing.lastError = error instanceof Error ? error.message : String(error);
      saveSettings();
      setDubbingStatus('error', state.settings.dubbing.lastError);
      refreshDubbingControls();
    }
  }

  async function refreshDubbingJob() {
    const result = state.settings.dubbing.result;
    if (!state.settings.dubbing.jobId && !state.settings.dubbing.pollUrl && !result?.audioUrl) {
      setDubbingStatus('error', '尚未创建中文配音任务。');
      return;
    }

    if (result?.audioUrl && state.settings.dubbing.status === 'done') {
      setDubbingStatus('done', '中文配音结果已就绪，可直接启用播放。');
      return;
    }

    try {
      const response = await requestJsonViaExtension(resolvePollUrl(), {
        method: 'GET',
        headers: buildProviderHeaders(state.settings.provider),
      });
      const normalized = normalizeJobEnvelope(response, state.settings.provider.baseUrl);

      if (normalized.result) {
        await applyDubbingResult(normalized.result);
        return;
      }

      state.settings.dubbing.status = normalized.status;
      state.settings.dubbing.lastError = normalized.error || '';
      if (normalized.jobId) {
        state.settings.dubbing.jobId = normalized.jobId;
      }
      if (normalized.pollUrl) {
        state.settings.dubbing.pollUrl = normalized.pollUrl;
      }
      saveSettings();

      if (normalized.status === 'failed') {
        stopDubbingPolling();
        setDubbingStatus('error', normalized.error || '中文配音任务失败。');
      } else {
        setDubbingStatus(normalized.status, `中文配音任务状态：${statusLabel(normalized.status)}`);
        if (normalized.status === 'queued' || normalized.status === 'running') {
          scheduleDubbingPolling();
        }
      }
      refreshDubbingControls();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.settings.dubbing.status = 'failed';
      state.settings.dubbing.lastError = message;
      saveSettings();
      stopDubbingPolling();
      setDubbingStatus('error', message);
      refreshDubbingControls();
    }
  }

  async function applyDubbingResult(result) {
    state.settings.dubbing.result = result;
    state.settings.dubbing.status = 'done';
    state.settings.dubbing.lastError = '';
    if (result.jobId) {
      state.settings.dubbing.jobId = result.jobId;
    }
    saveSettings();
    stopDubbingPolling();

    if (result.subtitleUrl) {
      await loadDubbedSubtitleTrack(result.subtitleUrl);
    } else {
      state.dubbedSubtitleTrack = null;
      await refreshTracks(false);
    }

    setDubbingStatus('done', '中文配音结果已就绪，可启用播放。');
    refreshDubbingControls();
    await syncDubbingPlayback(true);
  }

  async function loadDubbedSubtitleTrack(subtitleUrl) {
    try {
      const text = await fetchTextViaExtension(subtitleUrl);
      const cues = parseSubtitleFile(text);
      if (!cues.length) {
        return;
      }
      state.dubbedSubtitleTrack = {
        id: DUBBED_TRACK_ID,
        label: 'Dubbed Result Subtitle',
        kind: 'imported',
        lang: 'zh',
        cues,
      };
      await refreshTracks(false);
    } catch (error) {
      console.debug('btc bilingual: failed to load dubbed subtitle track', error);
    }
  }

  function buildChineseSubtitlePayload() {
    const track = getPreferredChineseTrackForDubbing();
    if (!track) {
      return {
        ok: false,
        message: '当前未找到可用中文字幕，请先选择中文轨或导入中文字幕文件。',
      };
    }

    const cues = getTrackCues(track);
    if (!cues.length) {
      return {
        ok: false,
        message: '中文字幕轨可见，但未解析出时间轴内容，暂时无法生成中文配音。',
      };
    }

    return {
      ok: true,
      payload: {
        trackId: track.id,
        label: track.label,
        language: track.lang || 'zh',
        cues,
      },
    };
  }

  function getPreferredChineseTrackForDubbing() {
    const currentSecondary = resolveTrack(state.settings.secondary);
    if (currentSecondary && currentSecondary.id !== DUBBED_TRACK_ID && currentSecondary.lang === 'zh') {
      return currentSecondary;
    }

    const currentPrimary = resolveTrack(state.settings.primary);
    if (currentPrimary && currentPrimary.id !== DUBBED_TRACK_ID && currentPrimary.lang === 'zh') {
      return currentPrimary;
    }

    return getCombinedTracks().find((track) => track.id !== DUBBED_TRACK_ID && track.lang === 'zh') || null;
  }

  function getTrackCues(track) {
    if (!track) {
      return [];
    }

    if (track.kind === 'imported' || track.kind === 'native-parsed') {
      return track.cues.map((cue) => ({
        start: cue.start,
        end: cue.end,
        text: cue.text,
      }));
    }

    const cues = Array.from(track.track?.cues || []);
    return cues
      .map((cue) => ({
        start: cue.startTime,
        end: cue.endTime,
        text: normalizeCueText(cue.text),
      }))
      .filter((cue) => cue.text);
  }

  function buildProviderHeaders(provider) {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (provider.apiKey) {
      headers.Authorization = `Bearer ${provider.apiKey}`;
    }

    return headers;
  }

  function validateProviderConfig(provider) {
    if (!provider.baseUrl) {
      return { ok: false, message: '请先填写 Provider Base URL。' };
    }

    try {
      const url = new URL(provider.baseUrl);
      if (!/^https?:$/.test(url.protocol)) {
        return { ok: false, message: 'Provider Base URL 仅支持 http / https。' };
      }
    } catch {
      return { ok: false, message: 'Provider Base URL 格式无效。' };
    }

    if (!provider.translationModel) {
      return { ok: false, message: '请先填写翻译模型名称。' };
    }

    if (!provider.ttsModel) {
      return { ok: false, message: '请先填写 TTS / 配音模型名称。' };
    }

    if ((provider.type === 'cloud' || provider.type === 'openai-compatible') && !provider.apiKey) {
      return { ok: false, message: '当前 Provider 类型通常需要 API Key / Token。' };
    }

    return { ok: true };
  }

  function normalizeJobEnvelope(data, baseUrl) {
    const source = data?.data && typeof data.data === 'object' ? data.data : data || {};
    const status = normalizeJobStatus(source.status || source.state || source.jobStatus || source.phase);
    const jobId = firstString(source.jobId, source.id, source.taskId, source.requestId);
    const pollUrl =
      resolveMaybeUrl(firstString(source.pollUrl, source.statusUrl, source.urls?.status), baseUrl) ||
      (jobId ? joinUrl(baseUrl, `/jobs/${encodeURIComponent(jobId)}`) : '');
    const result = normalizeDubResult(source.result || source.output || source, baseUrl);
    const error = normalizeErrorMessage(source.error || source.message || '');

    return {
      status: result ? 'done' : status,
      jobId,
      pollUrl,
      result,
      error,
    };
  }

  function normalizeDubResult(source, baseUrl = '') {
    if (!source || typeof source !== 'object') {
      return null;
    }

    const audioUrl = resolveMaybeUrl(
      firstString(
        source.audioUrl,
        source.dubAudioUrl,
        source.audio_url,
        source.url,
        source.result?.audioUrl,
        source.result?.dubAudioUrl
      ),
      baseUrl
    );

    if (!audioUrl) {
      return null;
    }

    return {
      jobId: firstString(source.jobId, source.id, source.taskId),
      audioUrl,
      subtitleUrl: resolveMaybeUrl(
        firstString(
          source.subtitleUrl,
          source.subtitle_url,
          source.vttUrl,
          source.result?.subtitleUrl,
          source.subtitles?.zh
        ),
        baseUrl
      ),
      segments: Array.isArray(source.segments) ? source.segments : [],
      audioOffsetSec: toFiniteNumber(source.audioOffsetSec) || 0,
    };
  }

  function normalizeJobStatus(value) {
    const normalized = String(value || '').toLowerCase();
    if (['queued', 'pending', 'created', 'submitted'].includes(normalized)) {
      return 'queued';
    }
    if (['running', 'processing', 'in_progress'].includes(normalized)) {
      return 'running';
    }
    if (['done', 'completed', 'success', 'succeeded'].includes(normalized)) {
      return 'done';
    }
    if (['failed', 'error', 'cancelled'].includes(normalized)) {
      return 'failed';
    }
    return normalized || 'queued';
  }

  function firstString(...values) {
    return values.find((value) => typeof value === 'string' && value.trim())?.trim() || '';
  }

  function normalizeErrorMessage(value) {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value.message === 'string') {
      return value.message;
    }
    return String(value);
  }

  function toFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function resolvePollUrl() {
    if (state.settings.dubbing.pollUrl) {
      return state.settings.dubbing.pollUrl;
    }
    if (state.settings.dubbing.jobId) {
      return joinUrl(state.settings.provider.baseUrl, `/jobs/${encodeURIComponent(state.settings.dubbing.jobId)}`);
    }
    return '';
  }

  function scheduleDubbingPolling() {
    stopDubbingPolling();
    state.pollTimer = window.setInterval(() => {
      void refreshDubbingJob();
    }, DUB_POLL_INTERVAL_MS);
  }

  function stopDubbingPolling() {
    if (state.pollTimer) {
      window.clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function setDubbingStatus(status, detail) {
    const kind = status === 'failed' || status === 'error' ? 'error' : status;
    state.dubbingStatus.textContent = detail || defaultStatusText(status);
    state.dubbingStatus.classList.toggle('is-error', kind === 'error');
  }

  function defaultStatusText(status) {
    if (status === 'queued') {
      return '中文配音任务已入队。';
    }
    if (status === 'running') {
      return '中文配音任务进行中。';
    }
    if (status === 'done') {
      return '中文配音结果已就绪。';
    }
    if (status === 'failed') {
      return '中文配音任务失败。';
    }
    return '尚未生成中文配音。';
  }

  function statusLabel(status) {
    return {
      queued: '排队中',
      running: '处理中',
      done: '已完成',
      failed: '失败',
    }[status] || status || '未知状态';
  }

  function refreshDubbingControls() {
    const hasChineseTrack = Boolean(getPreferredChineseTrackForDubbing());
    const hasResult = Boolean(state.settings.dubbing.result?.audioUrl);
    state.dubbingGenerateButton.disabled = !hasChineseTrack;
    state.dubbingRefreshButton.disabled = !state.settings.dubbing.jobId && !state.settings.dubbing.pollUrl && !hasResult;
    state.dubbingEnabledCheckbox.disabled = !hasResult;
    state.dubbingSubtitleModeSelect.disabled = !state.dubbedSubtitleTrack;
  }

  async function restorePersistedDubbing() {
    if (state.settings.dubbing.result?.subtitleUrl) {
      await loadDubbedSubtitleTrack(state.settings.dubbing.result.subtitleUrl);
    }
    refreshDubbingControls();
    await syncDubbingPlayback(true);
  }

  async function syncDubbingPlayback(forceSeekSync) {
    const result = state.settings.dubbing.result;
    const enabled = state.settings.dubbing.enabled === true;

    if (!enabled || !result?.audioUrl) {
      pauseDubbedAudio();
      restoreOriginalVideoAudio();
      return;
    }

    const audio = ensureDubbedAudio(result.audioUrl);
    audio.playbackRate = state.video.playbackRate || 1;

    if (state.video.paused || state.video.ended) {
      audio.pause();
      return;
    }

    saveOriginalVideoAudioState();
    state.video.muted = true;

    if (forceSeekSync || Math.abs(audio.currentTime - getTargetDubTime()) > DUB_SYNC_THRESHOLD_SEC) {
      setAudioTimeSafe(audio, getTargetDubTime());
    }

    try {
      await audio.play();
      setDubbingStatus('done', '中文配音播放中。可关闭开关切回原声。');
    } catch (error) {
      setDubbingStatus('error', `中文配音已就绪，但浏览器阻止自动播放：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function ensureDubbedAudio(audioUrl) {
    if (!state.dubbedAudio) {
      state.dubbedAudio = new Audio();
      state.dubbedAudio.preload = 'auto';
    }
    if (state.dubbedAudio.src !== audioUrl) {
      state.dubbedAudio.src = audioUrl;
      state.dubbedAudio.currentTime = 0;
    }
    return state.dubbedAudio;
  }

  function pauseDubbedAudio() {
    if (state.dubbedAudio) {
      state.dubbedAudio.pause();
    }
  }

  function syncDubbedAudioDrift() {
    if (!state.settings.dubbing.enabled || !state.dubbedAudio || state.video.paused) {
      return;
    }

    const target = getTargetDubTime();
    if (Math.abs(state.dubbedAudio.currentTime - target) > DUB_SYNC_THRESHOLD_SEC) {
      setAudioTimeSafe(state.dubbedAudio, target);
    }
  }

  function getTargetDubTime() {
    return Math.max(0, state.video.currentTime + (state.settings.dubbing.result?.audioOffsetSec || 0));
  }

  function setAudioTimeSafe(audio, currentTime) {
    try {
      audio.currentTime = Math.max(0, currentTime);
    } catch {
      console.debug('btc bilingual: unable to seek dubbed audio');
    }
  }

  function saveOriginalVideoAudioState() {
    if (!state.video || state.savedVideoAudioState) {
      return;
    }
    state.savedVideoAudioState = {
      muted: state.video.muted,
      volume: state.video.volume,
    };
  }

  function restoreOriginalVideoAudio() {
    if (!state.video || !state.savedVideoAudioState) {
      return;
    }
    state.video.muted = state.savedVideoAudioState.muted;
    state.video.volume = state.savedVideoAudioState.volume;
    state.savedVideoAudioState = null;
  }

  function normalizeSettings(raw) {
    const parsed = raw && typeof raw === 'object' ? raw : {};
    const provider = normalizeProvider(parsed.provider);
    return {
      enabled: parsed.enabled !== false,
      primary: typeof parsed.primary === 'string' ? parsed.primary : '',
      secondary: typeof parsed.secondary === 'string' ? parsed.secondary : '',
      provider,
      dubbing: normalizeDubbing(parsed.dubbing, provider.baseUrl),
    };
  }

  function normalizeProvider(provider) {
    const next = provider && typeof provider === 'object' ? provider : {};
    return {
      type: typeof next.type === 'string' && next.type ? next.type : DEFAULT_PROVIDER.type,
      baseUrl: typeof next.baseUrl === 'string' ? next.baseUrl : DEFAULT_PROVIDER.baseUrl,
      apiKey: typeof next.apiKey === 'string' ? next.apiKey : DEFAULT_PROVIDER.apiKey,
      translationModel:
        typeof next.translationModel === 'string' ? next.translationModel : DEFAULT_PROVIDER.translationModel,
      ttsModel: typeof next.ttsModel === 'string' ? next.ttsModel : DEFAULT_PROVIDER.ttsModel,
      voicePreset: typeof next.voicePreset === 'string' ? next.voicePreset : DEFAULT_PROVIDER.voicePreset,
    };
  }

  function normalizeDubbing(dubbing, baseUrl = '') {
    const next = dubbing && typeof dubbing === 'object' ? dubbing : {};
    const result = normalizeDubResult(next.result, baseUrl);
    return {
      enabled: next.enabled === true,
      jobId: typeof next.jobId === 'string' ? next.jobId : DEFAULT_DUBBING.jobId,
      pollUrl: typeof next.pollUrl === 'string' ? next.pollUrl : DEFAULT_DUBBING.pollUrl,
      status: normalizeJobStatus(next.status) || DEFAULT_DUBBING.status,
      lastError: typeof next.lastError === 'string' ? next.lastError : DEFAULT_DUBBING.lastError,
      result,
      subtitleMode:
        next.subtitleMode === 'generated' || next.subtitleMode === 'original'
          ? next.subtitleMode
          : DEFAULT_DUBBING.subtitleMode,
      timingSource: typeof next.timingSource === 'string' && next.timingSource ? next.timingSource : 'subtitle',
    };
  }

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(state.settings)));
  }

  function safeParseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function joinUrl(baseUrl, path) {
    const url = new URL(baseUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
    return url.toString();
  }

  function resolveMaybeUrl(value, baseUrl) {
    if (!value) {
      return '';
    }
    try {
      return new URL(value, baseUrl).toString();
    } catch {
      return value;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }
})();
