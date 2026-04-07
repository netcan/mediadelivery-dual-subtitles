(function () {
  'use strict';

  const isEmbedPage = /(^|\.)mediadelivery\.net$/.test(location.hostname) && location.pathname.startsWith('/embed/');

  if (!isEmbedPage) {
    return;
  }

  const STORAGE_KEY = 'btc-bilingual-subtitles-settings';
  const IMPORTED_TRACK_ID = 'imported-local';
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
    tracks: [],
    importedTrack: null,
    trackCache: new Map(),
    settings: loadSettings(),
    renderTimer: null,
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
      width: 280px;
      padding: 12px;
      border-radius: 12px;
      background: rgba(4, 17, 34, 0.9);
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
    #btc-bilingual-panel input[type="file"] {
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
    syncOverlayMount();
    void refreshTracks(true);

    video.addEventListener('loadedmetadata', () => void refreshTracks(true));
    video.addEventListener('seeked', renderSubtitles);
    video.addEventListener('play', renderSubtitles);
    video.addEventListener('timeupdate', renderSubtitles);
    document.addEventListener('fullscreenchange', syncOverlayMount);
    document.addEventListener('webkitfullscreenchange', syncOverlayMount);

    state.renderTimer = window.setInterval(() => {
      void refreshTracks(false);
      renderSubtitles();
    }, 600);
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

    root.querySelector('button').addEventListener('click', () => {
      state.panel.hidden = !state.panel.hidden;
    });

    state.enabledCheckbox.checked = state.settings.enabled !== false;
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
    const combined = [...nativeTracks];
    if (state.importedTrack) {
      combined.push(state.importedTrack);
    }

    if (resetDefaults || !isTrackAvailable(state.settings.primary, combined)) {
      state.settings.primary = pickTrack(combined, ['en'])?.id || combined[0]?.id || '';
    }
    if (resetDefaults || !isTrackAvailable(state.settings.secondary, combined) || state.settings.secondary === state.settings.primary) {
      state.settings.secondary =
        pickTrack(combined, ['zh', 'cn', 'hk'], state.settings.primary)?.id ||
        pickAnyOtherTrack(combined, state.settings.primary)?.id ||
        '';
    }

    applyTrackModes();
    renderOptions(combined);
    saveSettings();
    renderSubtitles();
  }

  function renderOptions(tracks) {
    const noneOption = `<option value="">None</option>`;
    const markup = tracks.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(formatTrackLabel(item))}</option>`).join('');
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
    if (state.importedTrack && id === IMPORTED_TRACK_ID) {
      return state.importedTrack;
    }
    return state.tracks.find((item) => item.id === id) || null;
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

  function pickTrack(tracks, languages, excludeId) {
    return tracks.find((track) => track.id !== excludeId && languages.includes(track.lang));
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

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }
})();
