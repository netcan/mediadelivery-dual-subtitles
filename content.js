(function () {
  'use strict';

  const isEmbedPage = /(^|\.)mediadelivery\.net$/.test(location.hostname) && location.pathname.startsWith('/embed/');

  if (!isEmbedPage) {
    return;
  }

  const STORAGE_KEY = 'dualsub-extension-settings';
  const IMPORTED_TRACK_ID = 'imported-local';
  const DUBBED_TRACK_ID = 'dubbed-generated';
  const DUB_POLL_INTERVAL_MS = 3000;
  const DUB_SYNC_INTERVAL_MS = 900;
  const DUB_SYNC_THRESHOLD_SEC = 0.35;
  const RESUME_SAVE_INTERVAL_MS = 5000;
  const RESUME_NEAR_END_THRESHOLD_SEC = 10;

  const DEFAULT_PROVIDER = {
    type: 'custom',
    baseUrl: '',
    apiKey: '',
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
    subtitleOverlay: null,
    primaryLine: null,
    secondaryLine: null,
    panel: null,
    primarySelect: null,
    secondarySelect: null,
    subtitleTimelineList: null,
    subtitleTimelineEmpty: null,
    enabledCheckbox: null,
    importInput: null,
    providerBaseUrlInput: null,
    providerApiKeyInput: null,
    providerVoicePresetSelect: null,
    providerVoiceRefreshButton: null,
    providerCapabilitiesNote: null,
    providerCapabilities: null,
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
    dubbedPreloadAudio: null,
    dubbedMediaCache: new Map(),
    dubbedMediaWindow: new Set(),
    savedVideoAudioState: null,
    keyboardHandler: null,
    subtitleOverlayPosition: null,
    subtitleDrag: null,
    subtitleTimelineEntries: [],
    activeSubtitleTimelineIndex: -1,
    resumeLifecycleBound: false,
    resumeRestoreAttempted: false,
    lastResumeSaveAt: 0,
  };

  const style = document.createElement('style');
  style.textContent = `
    #dualsub-bilingual-root {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483647;
      font-family: Arial, sans-serif;
    }

    #dualsub-bilingual-overlay.dualsub-hidden {
      display: none;
    }

    #dualsub-bilingual-overlay {
      position: absolute;
      left: 50%;
      bottom: 9%;
      transform: translateX(-50%);
      width: min(92%, 980px);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-shadow: 0 2px 6px rgba(0, 0, 0, 0.95);
      pointer-events: auto;
      cursor: grab;
      touch-action: none;
      user-select: none;
    }

    #dualsub-bilingual-overlay.dualsub-dragging {
      cursor: grabbing;
    }

    .dualsub-sub-line {
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

    .dualsub-sub-line.secondary {
      color: #7fd0ff;
      font-size: 24px;
      font-weight: 500;
    }

    #dualsub-bilingual-toggle {
      position: fixed;
      top: 12px;
      right: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: auto;
    }

    #dualsub-bilingual-toggle button {
      border: 0;
      border-radius: 999px;
      padding: 8px 12px;
      background: rgba(3, 16, 32, 0.82);
      color: #fff;
      font-size: 13px;
      cursor: pointer;
    }

    #dualsub-bilingual-panel {
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

    #dualsub-bilingual-panel[hidden] {
      display: none;
    }

    #dualsub-bilingual-panel label {
      display: block;
      margin: 10px 0 4px;
      color: #cfe0ff;
    }

    #dualsub-bilingual-panel select,
    #dualsub-bilingual-panel input[type="file"],
    #dualsub-bilingual-panel input[type="text"],
    #dualsub-bilingual-panel input[type="password"] {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid rgba(127, 208, 255, 0.22);
      border-radius: 8px;
      padding: 8px 10px;
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }

    #dualsub-bilingual-panel input[type="checkbox"] {
      margin-right: 8px;
    }

    #dualsub-bilingual-panel .dualsub-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }

    #dualsub-bilingual-panel .dualsub-section {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid rgba(127, 208, 255, 0.18);
    }

    #dualsub-bilingual-panel .dualsub-section-title {
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 700;
      color: #fff;
    }

    #dualsub-bilingual-panel .dualsub-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }

    #dualsub-bilingual-panel .dualsub-actions button {
      flex: 1 1 0;
      border: 1px solid rgba(127, 208, 255, 0.22);
      border-radius: 8px;
      padding: 8px 10px;
      background: rgba(127, 208, 255, 0.12);
      color: #fff;
      cursor: pointer;
    }

    #dualsub-bilingual-panel .dualsub-actions button[disabled] {
      cursor: not-allowed;
      opacity: 0.55;
    }

    #dualsub-bilingual-panel .dualsub-status {
      margin-top: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
      color: #dfe9ff;
      white-space: pre-wrap;
      word-break: break-word;
    }

    #dualsub-bilingual-panel .dualsub-status.is-error {
      background: rgba(255, 77, 79, 0.14);
      color: #ffd0d0;
    }

    #dualsub-bilingual-panel .dualsub-note {
      margin-top: 10px;
      color: #a9bddf;
      font-size: 12px;
    }

    #dualsub-bilingual-panel .dualsub-timeline {
      margin-top: 8px;
      max-height: 240px;
      overflow-y: auto;
      border: 1px solid rgba(127, 208, 255, 0.14);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
    }

    #dualsub-bilingual-panel .dualsub-timeline-item {
      display: block;
      width: 100%;
      border: 0;
      border-bottom: 1px solid rgba(127, 208, 255, 0.08);
      padding: 8px 10px;
      background: transparent;
      color: #fff;
      text-align: left;
      cursor: pointer;
    }

    #dualsub-bilingual-panel .dualsub-timeline-item:last-child {
      border-bottom: 0;
    }

    #dualsub-bilingual-panel .dualsub-timeline-item.is-active {
      background: rgba(127, 208, 255, 0.16);
    }

    #dualsub-bilingual-panel .dualsub-timeline-item:hover {
      background: rgba(127, 208, 255, 0.1);
    }

    #dualsub-bilingual-panel .dualsub-timeline-time {
      display: block;
      margin-bottom: 4px;
      color: #7fd0ff;
      font-size: 12px;
      font-weight: 700;
    }

    #dualsub-bilingual-panel .dualsub-timeline-primary,
    #dualsub-bilingual-panel .dualsub-timeline-secondary {
      display: block;
      line-height: 1.45;
      word-break: break-word;
    }

    #dualsub-bilingual-panel .dualsub-timeline-secondary {
      margin-top: 4px;
      color: #cfe0ff;
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
    state.resumeRestoreAttempted = false;
    state.lastResumeSaveAt = 0;

    video.addEventListener('loadedmetadata', () => {
      maybeRestorePlaybackPosition();
      void refreshTracks(true);
      void syncDubbingPlayback(true);
    });
    video.addEventListener('seeked', () => {
      persistPlaybackPosition(true);
      renderSubtitles();
      void syncDubbingPlayback(true);
    });
    video.addEventListener('play', () => {
      renderSubtitles();
      void syncDubbingPlayback(false);
    });
    video.addEventListener('pause', () => {
      persistPlaybackPosition(true);
      void syncDubbingPlayback(false);
    });
    video.addEventListener('ratechange', () => void syncDubbingPlayback(true));
    video.addEventListener('ended', () => void syncDubbingPlayback(true));
    video.addEventListener('timeupdate', () => {
      renderSubtitles();
      syncDubbedAudioDrift();
      persistPlaybackPosition(false);
    });
    document.addEventListener('fullscreenchange', syncOverlayMount);
    document.addEventListener('webkitfullscreenchange', syncOverlayMount);
    if (!state.keyboardHandler) {
      state.keyboardHandler = handleFullscreenKeyboardShortcut;
      document.addEventListener('keydown', state.keyboardHandler, true);
    }
    if (!state.resumeLifecycleBound) {
      state.resumeLifecycleBound = true;
      document.addEventListener('visibilitychange', handleResumeLifecyclePersist);
      window.addEventListener('pagehide', handleResumeLifecyclePersist);
      window.addEventListener('beforeunload', handleResumeLifecyclePersist);
    }
    if (video.readyState >= 1) {
      maybeRestorePlaybackPosition();
    }

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
    root.id = 'dualsub-bilingual-root';
    root.innerHTML = `
      <div id="dualsub-bilingual-overlay">
        <div class="dualsub-sub-line primary"></div>
        <div class="dualsub-sub-line secondary"></div>
      </div>
      <div id="dualsub-bilingual-toggle">
        <button type="button">双语字幕</button>
      </div>
      <div id="dualsub-bilingual-panel" hidden>
        <div class="dualsub-row">
          <label><input type="checkbox" id="dualsub-enabled">启用双语字幕</label>
        </div>
        <label for="dualsub-primary">主字幕</label>
        <select id="dualsub-primary"></select>
        <label for="dualsub-secondary">副字幕</label>
        <select id="dualsub-secondary"></select>
        <label for="dualsub-import">导入本地字幕（SRT / VTT）</label>
        <input id="dualsub-import" type="file" accept=".srt,.vtt,text/vtt,application/x-subrip">
        <div class="dualsub-note">默认优先选择 English + Chinese。若站点没给中文轨，可导入你自己的中文字幕文件。</div>

        <div class="dualsub-section">
          <div class="dualsub-section-title">字幕时间轴</div>
          <div id="dualsub-timeline" class="dualsub-timeline" role="listbox" aria-label="字幕时间轴"></div>
          <div id="dualsub-timeline-empty" class="dualsub-note">当前主字幕暂无可导航的时间轴内容。</div>
        </div>

        <div class="dualsub-section">
          <div class="dualsub-section-title">Python Provider</div>
          <label for="dualsub-provider-base-url">Provider 地址</label>
          <input id="dualsub-provider-base-url" type="text" placeholder="例如 http://127.0.0.1:8000">
          <label for="dualsub-provider-api-key">API Key / Token（可选）</label>
          <input id="dualsub-provider-api-key" type="password" placeholder="远端 Provider 需要时再填写">
          <div class="dualsub-actions">
            <button type="button" id="dualsub-provider-refresh-voices">读取音色</button>
          </div>
          <label for="dualsub-provider-voice-preset">音色</label>
          <select id="dualsub-provider-voice-preset">
            <option value="">跟随 Provider 默认音色</option>
          </select>
          <div id="dualsub-provider-capabilities-note" class="dualsub-note">模型和推理参数由 Provider 管理；前端只配置地址并选择音色。</div>
        </div>

        <div class="dualsub-section">
          <div class="dualsub-section-title">中文配音</div>
          <div class="dualsub-row">
            <label><input type="checkbox" id="dualsub-dubbing-enabled">启用中文配音</label>
          </div>
          <label for="dualsub-dubbing-subtitle-mode">中文字幕来源</label>
          <select id="dualsub-dubbing-subtitle-mode">
            <option value="original">优先原中文字幕</option>
            <option value="generated">优先配音结果字幕</option>
          </select>
          <div class="dualsub-actions">
            <button type="button" id="dualsub-dubbing-generate">生成中文配音</button>
            <button type="button" id="dualsub-dubbing-refresh">刷新状态</button>
          </div>
          <div id="dualsub-dubbing-status" class="dualsub-status">尚未生成中文配音。</div>
          <div class="dualsub-note">首期使用现有中文字幕驱动配音生成；ASR 作为后续扩展预留。</div>
        </div>
      </div>
    `;

    getOverlayMountTarget().appendChild(root);
    state.overlay = root;
    state.subtitleOverlay = root.querySelector('#dualsub-bilingual-overlay');
    state.primaryLine = root.querySelector('.dualsub-sub-line.primary');
    state.secondaryLine = root.querySelector('.dualsub-sub-line.secondary');
    state.panel = root.querySelector('#dualsub-bilingual-panel');
    state.primarySelect = root.querySelector('#dualsub-primary');
    state.secondarySelect = root.querySelector('#dualsub-secondary');
    state.subtitleTimelineList = root.querySelector('#dualsub-timeline');
    state.subtitleTimelineEmpty = root.querySelector('#dualsub-timeline-empty');
    state.enabledCheckbox = root.querySelector('#dualsub-enabled');
    state.importInput = root.querySelector('#dualsub-import');
    state.providerBaseUrlInput = root.querySelector('#dualsub-provider-base-url');
    state.providerApiKeyInput = root.querySelector('#dualsub-provider-api-key');
    state.providerVoicePresetSelect = root.querySelector('#dualsub-provider-voice-preset');
    state.providerVoiceRefreshButton = root.querySelector('#dualsub-provider-refresh-voices');
    state.providerCapabilitiesNote = root.querySelector('#dualsub-provider-capabilities-note');
    state.dubbingEnabledCheckbox = root.querySelector('#dualsub-dubbing-enabled');
    state.dubbingSubtitleModeSelect = root.querySelector('#dualsub-dubbing-subtitle-mode');
    state.dubbingGenerateButton = root.querySelector('#dualsub-dubbing-generate');
    state.dubbingRefreshButton = root.querySelector('#dualsub-dubbing-refresh');
    state.dubbingStatus = root.querySelector('#dualsub-dubbing-status');
    state.subtitleOverlay.addEventListener('pointerdown', handleSubtitleOverlayPointerDown);
    state.subtitleOverlay.addEventListener('pointermove', handleSubtitleOverlayPointerMove);
    state.subtitleOverlay.addEventListener('pointerup', handleSubtitleOverlayPointerEnd);
    state.subtitleOverlay.addEventListener('pointercancel', handleSubtitleOverlayPointerEnd);
    state.subtitleTimelineList.addEventListener('click', handleSubtitleTimelineClick);

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

    state.providerBaseUrlInput.addEventListener('change', handleProviderChange);
    state.providerApiKeyInput.addEventListener('change', handleProviderChange);
    state.providerVoicePresetSelect.addEventListener('change', handleProviderChange);
    state.providerVoiceRefreshButton.addEventListener('click', () => {
      void refreshProviderCapabilities(true);
    });

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
    state.providerBaseUrlInput.value = state.settings.provider.baseUrl;
    state.providerApiKeyInput.value = state.settings.provider.apiKey;
    renderProviderVoiceOptions();
    state.dubbingEnabledCheckbox.checked = state.settings.dubbing.enabled === true;
    state.dubbingSubtitleModeSelect.value = state.settings.dubbing.subtitleMode;
    setDubbingStatus(state.settings.dubbing.status, state.settings.dubbing.lastError || defaultStatusText(state.settings.dubbing.status));
    setProviderCapabilitiesNote('模型和推理参数由 Provider 管理；前端只配置地址并选择音色。');
    if (state.settings.provider.baseUrl) {
      void refreshProviderCapabilities(false);
    }
    refreshDubbingControls();
  }

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function isManagedVideoFullscreen() {
    const fullscreenElement = getFullscreenElement();
    return Boolean(fullscreenElement && state.video && fullscreenElement.contains(state.video));
  }

  function handleFullscreenKeyboardShortcut(event) {
    if (
      !state.video ||
      !isManagedVideoFullscreen() ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      isIgnoredShortcutTarget(event.target)
    ) {
      return;
    }

    let handled = false;
    if (event.code === 'Space' || event.key === ' ') {
      toggleManagedVideoPlayback();
      handled = true;
    } else if (event.code === 'ArrowLeft' || event.key === 'ArrowLeft') {
      seekManagedVideoBy(-5);
      handled = true;
    } else if (event.code === 'ArrowRight' || event.key === 'ArrowRight') {
      seekManagedVideoBy(5);
      handled = true;
    }

    if (!handled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  }

  function isIgnoredShortcutTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    if (target.isContentEditable) {
      return true;
    }
    if (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')) {
      return true;
    }
    return Boolean(target.closest('#dualsub-bilingual-panel, #dualsub-bilingual-toggle'));
  }

  function toggleManagedVideoPlayback() {
    if (!state.video) {
      return;
    }
    if (state.video.paused || state.video.ended) {
      void state.video.play().catch(() => {});
      return;
    }
    state.video.pause();
  }

  function seekManagedVideoBy(deltaSeconds) {
    if (!state.video) {
      return;
    }
    const duration = Number.isFinite(state.video.duration) ? state.video.duration : Number.POSITIVE_INFINITY;
    const nextTime = Math.min(Math.max(0, state.video.currentTime + deltaSeconds), duration);
    if (Math.abs(nextTime - state.video.currentTime) < 0.01) {
      return;
    }
    state.video.currentTime = nextTime;
    renderSubtitles();
    syncDubbedAudioDrift();
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
    syncSubtitleOverlayPosition();
  }

  function handleSubtitleOverlayPointerDown(event) {
    if (
      !state.subtitleOverlay ||
      event.button !== 0 ||
      !state.settings.enabled ||
      !(event.target instanceof Element) ||
      !event.target.closest('.dualsub-sub-line')
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const overlayRect = state.subtitleOverlay.getBoundingClientRect();
    const rootRect = state.overlay.getBoundingClientRect();
    const nextPosition = clampSubtitleOverlayPosition(
      overlayRect.left - rootRect.left,
      overlayRect.top - rootRect.top,
      overlayRect.width,
      overlayRect.height
    );

    state.subtitleOverlayPosition = nextPosition;
    state.subtitleDrag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - overlayRect.left,
      offsetY: event.clientY - overlayRect.top,
      width: overlayRect.width,
      height: overlayRect.height,
    };
    state.subtitleOverlay.classList.add('dualsub-dragging');
    state.subtitleOverlay.setPointerCapture(event.pointerId);
    applySubtitleOverlayPosition(nextPosition);
  }

  function handleSubtitleOverlayPointerMove(event) {
    if (!state.subtitleDrag || event.pointerId !== state.subtitleDrag.pointerId) {
      return;
    }

    event.preventDefault();
    const rootRect = state.overlay.getBoundingClientRect();
    const nextPosition = clampSubtitleOverlayPosition(
      event.clientX - rootRect.left - state.subtitleDrag.offsetX,
      event.clientY - rootRect.top - state.subtitleDrag.offsetY,
      state.subtitleDrag.width,
      state.subtitleDrag.height
    );

    state.subtitleOverlayPosition = nextPosition;
    applySubtitleOverlayPosition(nextPosition);
  }

  function handleSubtitleOverlayPointerEnd(event) {
    if (!state.subtitleDrag || event.pointerId !== state.subtitleDrag.pointerId) {
      return;
    }

    if (state.subtitleOverlay?.hasPointerCapture(event.pointerId)) {
      state.subtitleOverlay.releasePointerCapture(event.pointerId);
    }
    state.subtitleOverlay?.classList.remove('dualsub-dragging');
    state.subtitleDrag = null;
    syncSubtitleOverlayPosition();
  }

  function clampSubtitleOverlayPosition(left, top, width, height) {
    const rootRect = state.overlay.getBoundingClientRect();
    const maxLeft = Math.max(0, rootRect.width - width);
    const maxTop = Math.max(0, rootRect.height - height);
    return {
      left: Math.min(Math.max(0, left), maxLeft),
      top: Math.min(Math.max(0, top), maxTop),
    };
  }

  function applySubtitleOverlayPosition(position) {
    if (!state.subtitleOverlay) {
      return;
    }
    if (!position) {
      state.subtitleOverlay.style.left = '';
      state.subtitleOverlay.style.top = '';
      state.subtitleOverlay.style.bottom = '';
      state.subtitleOverlay.style.transform = '';
      return;
    }

    state.subtitleOverlay.style.left = `${position.left}px`;
    state.subtitleOverlay.style.top = `${position.top}px`;
    state.subtitleOverlay.style.bottom = 'auto';
    state.subtitleOverlay.style.transform = 'none';
  }

  function syncSubtitleOverlayPosition() {
    if (!state.subtitleOverlayPosition || !state.subtitleOverlay) {
      return;
    }
    const rect = state.subtitleOverlay.getBoundingClientRect();
    state.subtitleOverlayPosition = clampSubtitleOverlayPosition(
      state.subtitleOverlayPosition.left,
      state.subtitleOverlayPosition.top,
      rect.width,
      rect.height
    );
    applySubtitleOverlayPosition(state.subtitleOverlayPosition);
  }

  function handleResumeLifecyclePersist(event) {
    if (document.visibilityState === 'hidden' || event?.type !== 'visibilitychange') {
      persistPlaybackPosition(true);
    }
  }

  function getPlaybackResumeKey() {
    return [location.origin, location.pathname || ''].filter(Boolean).join('::');
  }

  function getPlaybackResumeEntry() {
    const key = getPlaybackResumeKey();
    if (!key) {
      return null;
    }
    const resume = state.settings.resume || {};
    if (resume[key]) {
      return resume[key];
    }
    return Object.entries(resume)
      .filter(([itemKey]) => itemKey.startsWith(`${key}::`))
      .sort(([, first], [, second]) => (Number(second?.updatedAt) || 0) - (Number(first?.updatedAt) || 0))[0]?.[1] || null;
  }

  function persistPlaybackPosition(forceSave) {
    if (!state.video) {
      return;
    }
    const key = getPlaybackResumeKey();
    if (!key) {
      return;
    }

    const now = Date.now();
    if (!forceSave && now - state.lastResumeSaveAt < RESUME_SAVE_INTERVAL_MS) {
      return;
    }

    if (!state.settings.resume || typeof state.settings.resume !== 'object') {
      state.settings.resume = {};
    }

    const currentTime = Math.max(0, state.video.currentTime || 0);
    if (currentTime < 1) {
      delete state.settings.resume[key];
    } else {
      state.settings.resume[key] = {
        currentTime,
        updatedAt: now,
        duration: Number.isFinite(state.video.duration) ? state.video.duration : 0,
      };
    }

    state.lastResumeSaveAt = now;
    saveSettings();
  }

  function maybeRestorePlaybackPosition() {
    if (!state.video || state.resumeRestoreAttempted || !Number.isFinite(state.video.duration) || state.video.duration <= 0) {
      return;
    }
    state.resumeRestoreAttempted = true;

    const entry = getPlaybackResumeEntry();
    if (!entry || !isValidPlaybackResumeEntry(entry, state.video.duration)) {
      return;
    }

    const targetTime = Math.max(0, Math.min(entry.currentTime, state.video.duration));
    if (targetTime <= 0) {
      return;
    }
    state.video.currentTime = targetTime;
    renderSubtitles();
    void syncDubbingPlayback(true);
  }

  function isValidPlaybackResumeEntry(entry, duration) {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    const currentTime = Number(entry.currentTime);
    if (!Number.isFinite(currentTime) || currentTime < 0 || currentTime > duration) {
      return false;
    }
    return duration - currentTime > RESUME_NEAR_END_THRESHOLD_SEC;
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
    refreshSubtitleTimeline(true);
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
    const overlayBox = state.subtitleOverlay;
    overlayBox.classList.toggle('dualsub-hidden', !enabled);
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
    syncSubtitleOverlayPosition();
    refreshSubtitleTimeline(false);
  }

  function handleSubtitleTimelineClick(event) {
    const item = event.target instanceof Element ? event.target.closest('.dualsub-timeline-item') : null;
    if (!item || !state.video) {
      return;
    }
    const index = Number(item.dataset.timelineIndex);
    const entry = state.subtitleTimelineEntries[index];
    if (!entry) {
      return;
    }
    state.video.currentTime = entry.start;
    refreshSubtitleTimeline(false);
  }

  function refreshSubtitleTimeline(rebuild) {
    if (!state.subtitleTimelineList || !state.subtitleTimelineEmpty) {
      return;
    }
    if (rebuild) {
      state.subtitleTimelineEntries = buildSubtitleTimelineEntries();
      renderSubtitleTimelineEntries();
    }
    updateActiveSubtitleTimelineItem();
  }

  function buildSubtitleTimelineEntries() {
    const primaryTrack = resolveTrack(state.settings.primary);
    if (!primaryTrack) {
      return [];
    }
    const primaryCues = getTrackCues(primaryTrack).filter((cue) => cue.text);
    const secondaryTrack = resolveTrack(state.settings.secondary);
    const secondaryCues =
      secondaryTrack && secondaryTrack.id !== primaryTrack.id ? getTrackCues(secondaryTrack).filter((cue) => cue.text) : [];

    return primaryCues.map((cue, index) => ({
      index,
      start: cue.start,
      end: cue.end,
      primaryText: cue.text,
      secondaryText: matchSecondaryTimelineText(secondaryCues, cue),
    }));
  }

  function matchSecondaryTimelineText(secondaryCues, primaryCue) {
    if (!secondaryCues.length) {
      return '';
    }
    const overlapping = secondaryCues.filter((cue) => cue.start < primaryCue.end && primaryCue.start < cue.end);
    if (overlapping.length) {
      return compactCueSegments(overlapping.map((cue) => cue.text));
    }

    const nearest = secondaryCues.find((cue) => Math.abs(cue.start - primaryCue.start) < 0.35);
    return nearest?.text || '';
  }

  function renderSubtitleTimelineEntries() {
    if (!state.subtitleTimelineList || !state.subtitleTimelineEmpty) {
      return;
    }
    const entries = state.subtitleTimelineEntries;
    state.subtitleTimelineEmpty.hidden = entries.length > 0;
    if (!entries.length) {
      state.subtitleTimelineList.innerHTML = '';
      state.activeSubtitleTimelineIndex = -1;
      return;
    }

    state.subtitleTimelineList.innerHTML = entries
      .map(
        (entry) => `
          <button type="button" class="dualsub-timeline-item" data-timeline-index="${entry.index}">
            <span class="dualsub-timeline-time">${escapeHtml(formatTimelineTime(entry.start))}</span>
            <span class="dualsub-timeline-primary">${escapeHtml(entry.primaryText)}</span>
            ${entry.secondaryText ? `<span class="dualsub-timeline-secondary">${escapeHtml(entry.secondaryText)}</span>` : ''}
          </button>
        `
      )
      .join('');
    state.activeSubtitleTimelineIndex = -1;
  }

  function updateActiveSubtitleTimelineItem() {
    if (!state.subtitleTimelineEntries.length || !state.subtitleTimelineList) {
      state.activeSubtitleTimelineIndex = -1;
      return;
    }

    const currentTime = state.video?.currentTime || 0;
    const nextIndex = findSubtitleTimelineEntryIndex(currentTime);
    if (nextIndex === state.activeSubtitleTimelineIndex) {
      return;
    }

    if (state.activeSubtitleTimelineIndex >= 0) {
      const previous = state.subtitleTimelineList.querySelector(`[data-timeline-index="${state.activeSubtitleTimelineIndex}"]`);
      previous?.classList.remove('is-active');
      previous?.removeAttribute('aria-current');
    }

    state.activeSubtitleTimelineIndex = nextIndex;
    if (nextIndex >= 0) {
      const active = state.subtitleTimelineList.querySelector(`[data-timeline-index="${nextIndex}"]`);
      active?.classList.add('is-active');
      active?.setAttribute('aria-current', 'true');
      ensureSubtitleTimelineItemVisible(active);
    }
  }

  function findSubtitleTimelineEntryIndex(currentTime) {
    const entries = state.subtitleTimelineEntries;
    if (!entries.length) {
      return -1;
    }

    let left = 0;
    let right = entries.length - 1;
    let matchIndex = -1;

    while (left <= right) {
      const middle = Math.floor((left + right) / 2);
      if (entries[middle].start <= currentTime) {
        matchIndex = middle;
        left = middle + 1;
      } else {
        right = middle - 1;
      }
    }

    return matchIndex;
  }

  function ensureSubtitleTimelineItemVisible(item) {
    if (!item || !state.subtitleTimelineList || state.panel?.hidden || state.video?.paused) {
      return;
    }

    const container = state.subtitleTimelineList;
    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();

    if (itemRect.top < containerRect.top) {
      container.scrollTop -= containerRect.top - itemRect.top;
      return;
    }
    if (itemRect.bottom > containerRect.bottom) {
      container.scrollTop += itemRect.bottom - containerRect.bottom;
    }
  }

  function formatTimelineTime(value) {
    const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
      console.debug('dualsub: failed to load track', src, error);
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
    const message = {
      type: 'httpRequest',
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    if (typeof options.body === 'string') {
      message.body = options.body;
    }
    const response = await chrome.runtime.sendMessage(message);

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

  async function requestBinaryMediaViaExtension(url, options = {}) {
    const response = await chrome.runtime.sendMessage({
      type: 'fetchBinaryMedia',
      url,
      headers: options.headers || {},
    });

    if (!response) {
      throw new Error('未收到扩展后台响应。');
    }
    if (!response.ok) {
      throw new Error(response.error || `媒体请求失败（HTTP ${response.status || 'unknown'}）`);
    }
    if (typeof response.dataBase64 !== 'string' || !response.dataBase64) {
      throw new Error('扩展后台未返回可用的音频数据。');
    }
    return {
      contentType: response.contentType || 'application/octet-stream',
      dataBase64: response.dataBase64,
    };
  }

  function decodeBase64ToBlob(base64Text, contentType) {
    const binary = atob(base64Text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: contentType || 'application/octet-stream' });
  }

  async function ensureDubbedMediaUrl(remoteUrl) {
    if (!remoteUrl) {
      throw new Error('缺少可播放的远端音频地址。');
    }

    const cached = state.dubbedMediaCache.get(remoteUrl);
    if (cached?.objectUrl) {
      cached.lastAccessAt = Date.now();
      return cached.objectUrl;
    }

    const payload = await requestBinaryMediaViaExtension(remoteUrl, {
      headers: buildProviderHeaders(state.settings.provider),
    });
    const objectUrl = URL.createObjectURL(decodeBase64ToBlob(payload.dataBase64, payload.contentType));
    state.dubbedMediaCache.set(remoteUrl, {
      remoteUrl,
      objectUrl,
      contentType: payload.contentType,
      lastAccessAt: Date.now(),
    });
    return objectUrl;
  }

  function revokeDubbedMediaUrl(remoteUrl) {
    const cached = state.dubbedMediaCache.get(remoteUrl);
    if (!cached?.objectUrl) {
      return;
    }
    if (state.dubbedAudio?.dataset.remoteUrl === remoteUrl) {
      state.dubbedAudio.removeAttribute('src');
      delete state.dubbedAudio.dataset.remoteUrl;
    }
    if (state.dubbedPreloadAudio?.dataset.remoteUrl === remoteUrl) {
      state.dubbedPreloadAudio.removeAttribute('src');
      delete state.dubbedPreloadAudio.dataset.remoteUrl;
    }
    URL.revokeObjectURL(cached.objectUrl);
    state.dubbedMediaCache.delete(remoteUrl);
  }

  async function syncDubbedMediaWindow(remoteUrls) {
    const nextWindow = new Set(remoteUrls.filter(Boolean));
    for (const remoteUrl of nextWindow) {
      await ensureDubbedMediaUrl(remoteUrl);
    }
    for (const remoteUrl of Array.from(state.dubbedMediaWindow)) {
      if (!nextWindow.has(remoteUrl)) {
        revokeDubbedMediaUrl(remoteUrl);
      }
    }
    state.dubbedMediaWindow = nextWindow;
  }

  function clearDubbedMediaWindow() {
    for (const remoteUrl of Array.from(state.dubbedMediaWindow)) {
      revokeDubbedMediaUrl(remoteUrl);
    }
    state.dubbedMediaWindow = new Set();
    if (state.dubbedAudio) {
      state.dubbedAudio.removeAttribute('src');
      delete state.dubbedAudio.dataset.remoteUrl;
    }
    if (state.dubbedPreloadAudio) {
      state.dubbedPreloadAudio.removeAttribute('src');
      delete state.dubbedPreloadAudio.dataset.remoteUrl;
    }
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

  function handleProviderChange(event) {
    const provider = {
      type: state.settings.provider.type || 'custom',
      baseUrl: state.providerBaseUrlInput.value.trim(),
      apiKey: state.providerApiKeyInput.value.trim(),
      voicePreset: state.providerVoicePresetSelect.value.trim(),
    };

    if (!provider.baseUrl) {
      provider.baseUrl = 'http://127.0.0.1:8000';
    }

    state.settings.provider = normalizeProvider(provider);
    if (state.providerBaseUrlInput.value.trim() !== state.settings.provider.baseUrl) {
      state.providerBaseUrlInput.value = state.settings.provider.baseUrl;
    }
    clearDubbedMediaWindow();
    saveSettings();
    if (event?.target === state.providerBaseUrlInput || event?.target === state.providerApiKeyInput) {
      void refreshProviderCapabilities(false);
    }
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
        voicePreset: state.settings.provider.voicePreset,
      },
      subtitles: subtitlePayload.payload,
    };

    setDubbingStatus('running', '正在创建中文配音任务…');
    stopDubbingPolling();
    state.settings.dubbing.result = null;
    state.dubbedSubtitleTrack = null;
    pauseDubbedAudio();
    clearDubbedMediaWindow();
    restoreOriginalVideoAudio();

    try {
      const response = await requestJsonViaExtension(joinUrl(state.settings.provider.baseUrl, '/jobs'), {
        method: 'POST',
        headers: buildProviderHeaders(state.settings.provider),
        body: JSON.stringify(requestBody),
      });

      const normalized = normalizeJobEnvelope(response, state.settings.provider.baseUrl);
      if (normalized.result) {
        await applyDubbingResult(normalized.result, normalized.status);
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
        await applyDubbingResult(normalized.result, normalized.status);
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

  async function applyDubbingResult(result, nextStatus = 'done') {
    state.settings.dubbing.result = result;
    state.settings.dubbing.status = normalizeJobStatus(nextStatus) || (result.audioUrl ? 'done' : 'running');
    state.settings.dubbing.lastError = '';
    if (result.jobId) {
      state.settings.dubbing.jobId = result.jobId;
    }
    saveSettings();

    if (result.subtitleUrl) {
      await loadDubbedSubtitleTrack(result.subtitleUrl);
    } else {
      state.dubbedSubtitleTrack = null;
      await refreshTracks(false);
    }

    if (state.settings.dubbing.status === 'done' && result.audioUrl) {
      stopDubbingPolling();
      setDubbingStatus('done', '中文配音结果已就绪，可启用播放。');
    } else {
      setDubbingStatus('running', getPartialDubbingDetail(result));
      scheduleDubbingPolling();
    }
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
        sourceUrl: subtitleUrl,
        cues,
      };
      await refreshTracks(false);
    } catch (error) {
      console.debug('dualsub: failed to load dubbed subtitle track', error);
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
      return sortCuesByTime(track.cues.map((cue) => ({
        start: cue.start,
        end: cue.end,
        text: cue.text,
      })));
    }

    const cues = Array.from(track.track?.cues || []);
    return sortCuesByTime(
      cues.map((cue) => ({
        start: cue.startTime,
        end: cue.endTime,
        text: normalizeCueText(cue.text),
      }))
    ).filter((cue) => cue.text);
  }

  function sortCuesByTime(cues) {
    return [...cues].sort((left, right) => {
      if (left.start !== right.start) {
        return left.start - right.start;
      }
      return left.end - right.end;
    });
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

    return { ok: true };
  }

  function normalizeProviderCapabilities(data) {
    const source = data?.data && typeof data.data === 'object' ? data.data : data || {};
    const voicesRaw = Array.isArray(source.voices) ? source.voices : Array.isArray(source.voicePresets) ? source.voicePresets : [];
    const voices = voicesRaw
      .map((voice) => {
        if (typeof voice === 'string') {
          return { id: voice, label: voice };
        }
        if (!voice || typeof voice !== 'object') {
          return null;
        }
        const id = firstString(voice.id, voice.value, voice.name, voice.key);
        if (!id) {
          return null;
        }
        return {
          id,
          label: firstString(voice.label, voice.title, voice.name, id),
        };
      })
      .filter(Boolean);
    const defaultVoice = firstString(source.defaultVoice, source.default_voice, source.voice);
    if (defaultVoice && !voices.some((voice) => voice.id === defaultVoice)) {
      voices.unshift({ id: defaultVoice, label: defaultVoice });
    }
    return {
      voices,
      defaultVoice,
      provider: firstString(source.provider, source.name) || 'provider',
    };
  }

  function renderProviderVoiceOptions() {
    if (!state.providerVoicePresetSelect) {
      return;
    }

    const currentVoice = state.settings.provider.voicePreset || '';
    const voices = Array.isArray(state.providerCapabilities?.voices) ? state.providerCapabilities.voices : [];
    const options = [{ id: '', label: '跟随 Provider 默认音色' }, ...voices];

    if (currentVoice && !options.some((voice) => voice.id === currentVoice)) {
      options.push({ id: currentVoice, label: `${currentVoice}（当前配置）` });
    }

    state.providerVoicePresetSelect.innerHTML = options
      .map((voice) => `<option value="${escapeHtml(voice.id)}">${escapeHtml(voice.label)}</option>`)
      .join('');
    state.providerVoicePresetSelect.value = options.some((voice) => voice.id === currentVoice) ? currentVoice : '';
  }

  function setProviderCapabilitiesNote(message) {
    if (state.providerCapabilitiesNote) {
      state.providerCapabilitiesNote.textContent = message;
    }
  }

  async function refreshProviderCapabilities(showStatus) {
    if (!state.settings.provider.baseUrl) {
      state.providerCapabilities = null;
      renderProviderVoiceOptions();
      if (showStatus) {
        setProviderCapabilitiesNote('请先填写 Provider 地址。');
      }
      return;
    }

    try {
      const response = await requestJsonViaExtension(joinUrl(state.settings.provider.baseUrl, '/capabilities'), {
        method: 'GET',
        headers: buildProviderHeaders(state.settings.provider),
      });
      state.providerCapabilities = normalizeProviderCapabilities(response);
      if (!state.settings.provider.voicePreset && state.providerCapabilities.defaultVoice) {
        state.settings.provider.voicePreset = state.providerCapabilities.defaultVoice;
      }
      renderProviderVoiceOptions();
      saveSettings();
      if (showStatus || state.providerCapabilities.voices.length) {
        setProviderCapabilitiesNote(
          state.providerCapabilities.voices.length
            ? `已读取 ${state.providerCapabilities.voices.length} 个音色；模型参数由 Provider 管理。`
            : 'Provider 未返回可选音色，当前将使用默认音色。'
        );
      }
    } catch (error) {
      state.providerCapabilities = null;
      renderProviderVoiceOptions();
      if (showStatus) {
        setProviderCapabilitiesNote(`读取音色失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }
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
      status: result?.audioUrl ? 'done' : status,
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
    const segments = normalizeDubSegments(
      Array.isArray(source.segments) ? source.segments : Array.isArray(source.result?.segments) ? source.result.segments : [],
      baseUrl
    );
    const playback = source.playback && typeof source.playback === 'object' ? source.playback : {};
    const readyThroughSec = toFiniteNumber(source.readyThroughSec ?? playback.readyThroughSec) || 0;
    const readySegmentCount =
      toFiniteNumber(source.readySegmentCount ?? playback.readySegmentCount) || segments.filter((segment) => segment.audioUrl).length;
    const playable = Boolean(source.playable ?? playback.playable ?? audioUrl);
    const totalSegments = toFiniteNumber(source.totalSegments ?? playback.totalSegments) || segments.length;
    const subtitleUrl = resolveMaybeUrl(
      firstString(
        source.subtitleUrl,
        source.subtitle_url,
        source.vttUrl,
        source.result?.subtitleUrl,
        source.subtitles?.zh
      ),
      baseUrl
    );

    if (!audioUrl && !subtitleUrl && !segments.length && !playable) {
      return null;
    }

    return {
      jobId: firstString(source.jobId, source.id, source.taskId),
      audioUrl,
      subtitleUrl,
      segments,
      audioOffsetSec: toFiniteNumber(source.audioOffsetSec) || 0,
      playable,
      readyThroughSec,
      readySegmentCount,
      totalSegments,
      partial: !audioUrl,
    };
  }

  function normalizeDubSegments(segments, baseUrl = '') {
    if (!Array.isArray(segments)) {
      return [];
    }
    return segments
      .map((segment, index) => normalizeDubSegment(segment, baseUrl, index))
      .filter(Boolean);
  }

  function normalizeDubSegment(segment, baseUrl = '', fallbackIndex = 0) {
    if (!segment || typeof segment !== 'object') {
      return null;
    }
    return {
      index: Number.isFinite(Number(segment.index)) ? Number(segment.index) : fallbackIndex,
      start: toFiniteNumber(segment.start) || 0,
      end: toFiniteNumber(segment.end) || 0,
      text: typeof segment.text === 'string' ? segment.text : '',
      cueCount: toFiniteNumber(segment.cueCount) || 0,
      status: normalizeJobStatus(segment.status || segment.state || ''),
      audioUrl: resolveMaybeUrl(firstString(segment.audioUrl, segment.audio_url, segment.url), baseUrl),
      audioDurationSec: toFiniteNumber(segment.audioDurationSec ?? segment.audio_duration_sec) || 0,
      voicePreset: firstString(segment.voicePreset, segment.voice_preset),
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

  function hasPlayableDubResult(result) {
    if (!result || typeof result !== 'object') {
      return false;
    }
    if (result.audioUrl) {
      return true;
    }
    if (result.playable) {
      return true;
    }
    return getReadyDubSegments(result).length > 0;
  }

  function getReadyDubSegments(result) {
    return Array.isArray(result?.segments) ? result.segments.filter((segment) => segment?.audioUrl) : [];
  }

  function getPartialDubbingDetail(result) {
    if (!result || typeof result !== 'object') {
      return '';
    }
    const readyThroughSec = Number(result.readyThroughSec || 0);
    const readySegmentCount = Number(result.readySegmentCount || 0);
    if (readySegmentCount > 0) {
      return `中文配音前 ${readyThroughSec.toFixed(1)} 秒已可播放，后台继续生成中。`;
    }
    return '中文配音任务进行中。';
  }

  function refreshDubbingControls() {
    const hasChineseTrack = Boolean(getPreferredChineseTrackForDubbing());
    const hasResult = hasPlayableDubResult(state.settings.dubbing.result);
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

    if (!enabled || !hasPlayableDubResult(result)) {
      pauseDubbedAudio();
      clearDubbedMediaWindow();
      restoreOriginalVideoAudio();
      return;
    }

    if (!result.partial && result.audioUrl) {
      await syncFullDubbedPlayback(result, forceSeekSync);
      return;
    }

    await syncSegmentedDubbedPlayback(result, forceSeekSync);
  }

  async function syncFullDubbedPlayback(result, forceSeekSync) {
    await syncDubbedMediaWindow([result.audioUrl]);
    const audio = ensureDubbedAudio(result.audioUrl, await ensureDubbedMediaUrl(result.audioUrl));
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
      pauseDubbedAudio();
      restoreOriginalVideoAudio();
      setDubbingStatus('error', `中文配音已就绪，但浏览器阻止自动播放：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function syncSegmentedDubbedPlayback(result, forceSeekSync) {
    const targetTime = getTargetDubTime();
    const activeSegment = findReadyDubSegmentForTime(result, targetTime);

    if (!activeSegment) {
      pauseDubbedAudio();
      clearDubbedMediaWindow();
      restoreOriginalVideoAudio();
      setDubbingStatus('running', getPartialDubbingDetail(result));
      return;
    }

    const nextSegment = getReadyDubSegments(result).find((segment) => segment.index > activeSegment.index);
    const requiredRemoteUrls = [activeSegment.audioUrl];
    if (nextSegment?.audioUrl) {
      requiredRemoteUrls.push(nextSegment.audioUrl);
    }
    await syncDubbedMediaWindow(requiredRemoteUrls);
    const audio = ensureDubbedAudio(activeSegment.audioUrl, await ensureDubbedMediaUrl(activeSegment.audioUrl));
    audio.playbackRate = state.video.playbackRate || 1;
    void preloadNextDubSegment(nextSegment);

    if (state.video.paused || state.video.ended) {
      audio.pause();
      return;
    }

    saveOriginalVideoAudioState();
    state.video.muted = true;

    const segmentTargetTime = Math.max(0, targetTime - activeSegment.start);
    if (forceSeekSync || Math.abs(audio.currentTime - segmentTargetTime) > DUB_SYNC_THRESHOLD_SEC) {
      setAudioTimeSafe(audio, segmentTargetTime);
    }

    try {
      await audio.play();
      setDubbingStatus('running', `中文配音分段播放中，已生成 ${activeSegment.index + 1}/${result.totalSegments || result.segments.length || '?' } 段。`);
    } catch (error) {
      pauseDubbedAudio();
      restoreOriginalVideoAudio();
      setDubbingStatus('error', `中文配音分段已就绪，但浏览器阻止自动播放：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function getSegmentPlayableEnd(segment) {
    const durationSec = Math.max(segment.audioDurationSec || 0, (segment.end || 0) - (segment.start || 0));
    return (segment.start || 0) + durationSec;
  }

  function findReadyDubSegmentForTime(result, targetTime) {
    const segments = getReadyDubSegments(result);
    let candidate = null;
    for (const segment of segments) {
      if (targetTime < segment.start) {
        continue;
      }
      if (targetTime < getSegmentPlayableEnd(segment)) {
        if (!candidate || segment.start >= candidate.start) {
          candidate = segment;
        }
      }
    }
    return candidate;
  }

  function ensureDubbedPreloadAudio() {
    if (!state.dubbedPreloadAudio) {
      state.dubbedPreloadAudio = new Audio();
      state.dubbedPreloadAudio.preload = 'auto';
    }
    return state.dubbedPreloadAudio;
  }

  async function preloadNextDubSegment(nextSegment) {
    if (!nextSegment?.audioUrl) {
      return;
    }
    const preloadAudio = ensureDubbedPreloadAudio();
    const objectUrl = await ensureDubbedMediaUrl(nextSegment.audioUrl);
    if (preloadAudio.dataset.remoteUrl !== nextSegment.audioUrl) {
      preloadAudio.src = objectUrl;
      preloadAudio.dataset.remoteUrl = nextSegment.audioUrl;
    }
  }

  function ensureDubbedAudio(audioUrl, playbackUrl = audioUrl) {
    if (!state.dubbedAudio) {
      state.dubbedAudio = new Audio();
      state.dubbedAudio.preload = 'auto';
    }
    if (state.dubbedAudio.dataset.remoteUrl !== audioUrl) {
      state.dubbedAudio.src = playbackUrl;
      state.dubbedAudio.dataset.remoteUrl = audioUrl;
      state.dubbedAudio.currentTime = 0;
    }
    return state.dubbedAudio;
  }

  function pauseDubbedAudio() {
    if (state.dubbedAudio) {
      state.dubbedAudio.pause();
    }
    if (state.dubbedPreloadAudio) {
      state.dubbedPreloadAudio.pause();
    }
  }

  function syncDubbedAudioDrift() {
    if (!state.settings.dubbing.enabled || !state.dubbedAudio || state.video.paused) {
      return;
    }

    if (state.settings.dubbing.result?.partial) {
      const activeSegment = findReadyDubSegmentForTime(state.settings.dubbing.result, getTargetDubTime());
      if (!activeSegment) {
        pauseDubbedAudio();
        clearDubbedMediaWindow();
        restoreOriginalVideoAudio();
        return;
      }
      if (state.dubbedAudio.dataset.remoteUrl !== activeSegment.audioUrl) {
        void syncDubbingPlayback(true);
        return;
      }
      const target = Math.max(0, getTargetDubTime() - activeSegment.start);
      if (Math.abs(state.dubbedAudio.currentTime - target) > DUB_SYNC_THRESHOLD_SEC) {
        setAudioTimeSafe(state.dubbedAudio, target);
      }
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
      console.debug('dualsub: unable to seek dubbed audio');
    }
  }

  function saveOriginalVideoAudioState() {
    if (!state.video || state.savedVideoAudioState) {
      return;
    }
    const persisted = readPersistedOriginalVideoAudioState();
    state.savedVideoAudioState = persisted || {
      muted: state.video.muted,
      volume: state.video.volume,
    };
    persistOriginalVideoAudioState(state.savedVideoAudioState);
  }

  function restoreOriginalVideoAudio() {
    if (!state.video) {
      return;
    }
    const saved = state.savedVideoAudioState || readPersistedOriginalVideoAudioState();
    if (!saved) {
      return;
    }
    state.video.muted = saved.muted;
    state.video.volume = saved.volume;
    state.savedVideoAudioState = null;
    clearPersistedOriginalVideoAudioState();
  }

  function persistOriginalVideoAudioState(audioState) {
    if (!state.video || !audioState) {
      return;
    }
    state.video.dataset.dualsubOriginalMuted = audioState.muted ? 'true' : 'false';
    state.video.dataset.dualsubOriginalVolume = String(audioState.volume);
    state.video.dataset.dualsubDubbingManaged = 'true';
  }

  function readPersistedOriginalVideoAudioState() {
    if (!state.video || state.video.dataset.dualsubDubbingManaged !== 'true') {
      return null;
    }
    const parsedVolume = Number.parseFloat(state.video.dataset.dualsubOriginalVolume || '1');
    return {
      muted: state.video.dataset.dualsubOriginalMuted === 'true',
      volume: Number.isFinite(parsedVolume) ? parsedVolume : 1,
    };
  }

  function clearPersistedOriginalVideoAudioState() {
    if (!state.video) {
      return;
    }
    delete state.video.dataset.dualsubOriginalMuted;
    delete state.video.dataset.dualsubOriginalVolume;
    delete state.video.dataset.dualsubDubbingManaged;
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
      resume: normalizePlaybackResume(parsed.resume),
    };
  }

  function normalizeProvider(provider) {
    const next = provider && typeof provider === 'object' ? provider : {};
    return {
      type: typeof next.type === 'string' && next.type ? next.type : DEFAULT_PROVIDER.type,
      baseUrl: typeof next.baseUrl === 'string' ? next.baseUrl : DEFAULT_PROVIDER.baseUrl,
      apiKey: typeof next.apiKey === 'string' ? next.apiKey : DEFAULT_PROVIDER.apiKey,
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

  function compactDubResultForStorage(result) {
    if (!result || typeof result !== 'object') {
      return null;
    }
    return {
      jobId: result.jobId || '',
      audioUrl: result.audioUrl || '',
      subtitleUrl: result.subtitleUrl || '',
      audioOffsetSec: result.audioOffsetSec || 0,
      playable: result.playable === true,
      readyThroughSec: result.readyThroughSec || 0,
      readySegmentCount: result.readySegmentCount || 0,
      totalSegments: result.totalSegments || 0,
      partial: result.partial === true,
      segments: [],
    };
  }

  function normalizePlaybackResume(resume) {
    const next = resume && typeof resume === 'object' ? resume : {};
    const normalized = {};
    for (const [key, value] of Object.entries(next)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const currentTime = Number(value.currentTime);
      if (!Number.isFinite(currentTime) || currentTime < 0) {
        continue;
      }
      normalized[key] = {
        currentTime,
        updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0,
        duration: Number.isFinite(Number(value.duration)) ? Number(value.duration) : 0,
      };
    }
    return normalized;
  }

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveSettings() {
    const normalized = normalizeSettings(state.settings);
    if (normalized.dubbing?.result) {
      normalized.dubbing.result = compactDubResultForStorage(normalized.dubbing.result);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
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
