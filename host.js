(function () {
  'use strict';

  if (window.top !== window) {
    return;
  }

  const EMBED_IFRAME_SELECTOR = 'iframe[src*="iframe.mediadelivery.net/embed/"]';
  const EMBED_MESSAGE_SOURCE = 'dualsub-embed';
  const HOST_MESSAGE_SOURCE = 'dualsub-host';
  const STORAGE_KEY = 'dualsub-host-floating-state';
  const DEFAULT_WIDTH = 460;
  const DEFAULT_HEIGHT = 360;
  const MIN_WIDTH = 320;
  const MIN_HEIGHT = 180;
  const MAX_SHARE_EXPORT_HEIGHT = 12000;
  const records = [];
  let observer = null;

  injectStyle();
  scanFrames();
  window.addEventListener('message', handleEmbedMessage);
  document.addEventListener('fullscreenchange', syncRecordVisibility);
  document.addEventListener('webkitfullscreenchange', syncRecordVisibility);
  window.addEventListener('resize', handleWindowResize);

  observer = new MutationObserver(() => {
    scanFrames();
    syncRecordVisibility();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  function injectStyle() {
    if (document.getElementById('dualsub-host-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'dualsub-host-style';
    style.textContent = `
      .dualsub-host-timeline {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 2147483646;
        width: min(460px, calc(100vw - 32px));
        max-height: calc(100vh - 16px);
        font-family: Arial, sans-serif;
        color: #fff;
        pointer-events: auto;
      }

      .dualsub-host-timeline[hidden] {
        display: none !important;
      }

      .dualsub-host-timeline.dualsub-host-collapsed .dualsub-host-body,
      .dualsub-host-timeline.dualsub-host-collapsed .dualsub-host-resize {
        display: none;
      }

      .dualsub-host-timeline.dualsub-host-dragging {
        user-select: none;
        cursor: grabbing;
      }

      .dualsub-host-timeline.dualsub-host-resizing {
        user-select: none;
      }

      .dualsub-host-card {
        display: flex;
        flex-direction: column;
        height: 100%;
        border: 1px solid rgba(127, 208, 255, 0.16);
        border-radius: 10px;
        padding: 12px;
        background: rgba(5, 10, 18, 0.82);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
        backdrop-filter: blur(4px);
      }

      .dualsub-host-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
        cursor: grab;
      }

      .dualsub-host-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .dualsub-host-title {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
        color: #fff;
      }

      .dualsub-host-button {
        border: 1px solid rgba(127, 208, 255, 0.22);
        border-radius: 999px;
        padding: 4px 8px;
        background: rgba(127, 208, 255, 0.12);
        color: #fff;
        font-size: 12px;
        cursor: pointer;
      }

      .dualsub-host-button:hover {
        background: rgba(127, 208, 255, 0.2);
      }

      .dualsub-host-note {
        margin-top: 10px;
        color: #a9bddf;
        font-size: 12px;
      }

      .dualsub-host-body {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
        flex-direction: column;
      }

      .dualsub-host-list {
        margin-top: 8px;
        flex: 1 1 auto;
        min-height: 96px;
        overflow-y: auto;
        border: 1px solid rgba(127, 208, 255, 0.14);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.04);
      }

      .dualsub-host-item {
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

      .dualsub-host-item:last-child {
        border-bottom: 0;
      }

      .dualsub-host-item.is-active {
        background: rgba(127, 208, 255, 0.16);
      }

      .dualsub-host-item.is-selected {
        background: rgba(127, 208, 255, 0.12);
        box-shadow: inset 0 0 0 1px rgba(127, 208, 255, 0.42);
      }

      .dualsub-host-item.is-active.is-selected {
        background: rgba(127, 208, 255, 0.22);
        box-shadow: inset 0 0 0 1px rgba(127, 208, 255, 0.75);
      }

      .dualsub-host-item:hover {
        background: rgba(127, 208, 255, 0.1);
      }

      .dualsub-host-time {
        display: block;
        margin-bottom: 4px;
        color: #7fd0ff;
        font-size: 12px;
        font-weight: 700;
      }

      .dualsub-host-primary,
      .dualsub-host-secondary {
        display: block;
        line-height: 1.45;
        word-break: break-word;
      }

      .dualsub-host-secondary {
        margin-top: 4px;
        color: #cfe0ff;
        font-size: 12px;
      }

      .dualsub-host-resize {
        position: absolute;
        right: 6px;
        bottom: 6px;
        width: 16px;
        height: 16px;
        cursor: nwse-resize;
        border-radius: 4px;
        background:
          linear-gradient(135deg, transparent 0 40%, rgba(127, 208, 255, 0.45) 40% 52%, transparent 52% 100%),
          linear-gradient(135deg, transparent 0 58%, rgba(127, 208, 255, 0.75) 58% 70%, transparent 70% 100%);
      }
    `;
    document.documentElement.appendChild(style);
  }

  function scanFrames() {
    const iframes = Array.from(document.querySelectorAll(EMBED_IFRAME_SELECTOR));
    for (const iframe of iframes) {
      if (records.some((record) => record.iframe === iframe)) {
        continue;
      }
      records.push(createRecord(iframe));
    }
  }

  function createRecord(iframe) {
    const host = document.createElement('div');
    host.className = 'dualsub-host-timeline';
    host.hidden = true;
    host.innerHTML = `
      <div class="dualsub-host-card">
        <div class="dualsub-host-heading">
          <h3 class="dualsub-host-title">字幕时间轴</h3>
          <div class="dualsub-host-actions">
            <button type="button" class="dualsub-host-button dualsub-host-locate">定位当前</button>
            <button type="button" class="dualsub-host-button dualsub-host-select-all" disabled>全选</button>
            <button type="button" class="dualsub-host-button dualsub-host-clear" disabled>清空选择</button>
            <button type="button" class="dualsub-host-button dualsub-host-share" disabled>复制图片</button>
            <button type="button" class="dualsub-host-button dualsub-host-export" disabled>导出 TXT</button>
            <button type="button" class="dualsub-host-button dualsub-host-toggle" aria-expanded="true">折叠</button>
          </div>
        </div>
        <div class="dualsub-host-body">
          <div class="dualsub-host-note">非全屏模式下可在页面中悬浮查看更多双语字幕上下文。</div>
          <div class="dualsub-host-list" role="listbox" aria-label="视频下方字幕时间轴"></div>
          <div class="dualsub-host-note dualsub-host-empty">当前主字幕暂无可导航的时间轴内容。</div>
        </div>
        <div class="dualsub-host-resize" aria-hidden="true"></div>
      </div>
    `;

    document.body.appendChild(host);

    const record = {
      iframe,
      host,
      heading: host.querySelector('.dualsub-host-heading'),
      body: host.querySelector('.dualsub-host-body'),
      list: host.querySelector('.dualsub-host-list'),
      empty: host.querySelector('.dualsub-host-empty'),
      locateButton: host.querySelector('.dualsub-host-locate'),
      selectAllButton: host.querySelector('.dualsub-host-select-all'),
      clearButton: host.querySelector('.dualsub-host-clear'),
      shareButton: host.querySelector('.dualsub-host-share'),
      exportButton: host.querySelector('.dualsub-host-export'),
      toggleButton: host.querySelector('.dualsub-host-toggle'),
      resizeHandle: host.querySelector('.dualsub-host-resize'),
      entries: [],
      activeIndex: -1,
      paused: false,
      forceLocate: false,
      selectedIndexes: new Set(),
      selectionAnchorIndex: -1,
      drag: null,
      resize: null,
      state: loadRecordState(),
    };

    record.list.addEventListener('click', (event) => handleTimelineClick(record, event));
    record.locateButton.addEventListener('click', () => locateCurrentTimelineItem(record));
    record.selectAllButton.addEventListener('click', () => selectAllTimelineEntries(record));
    record.clearButton.addEventListener('click', () => clearTimelineSelection(record));
    record.shareButton.addEventListener('click', () => {
      void copyTimelineShareImage(record);
    });
    record.exportButton.addEventListener('click', () => exportTimelineTxt(record));
    record.toggleButton.addEventListener('click', () => toggleRecordCollapsed(record));
    record.heading.addEventListener('pointerdown', (event) => handleDragStart(record, event));
    record.resizeHandle.addEventListener('pointerdown', (event) => handleResizeStart(record, event));
    applyRecordState(record, records.length);
    return record;
  }

  function handleEmbedMessage(event) {
    if (!event.data || event.data.source !== EMBED_MESSAGE_SOURCE) {
      return;
    }

    const record = records.find((item) => item.iframe.contentWindow === event.source);
    if (!record) {
      return;
    }

    if (event.data.type === 'timeline-state') {
      record.entries = Array.isArray(event.data.entries) ? event.data.entries : [];
      record.activeIndex = Number.isInteger(event.data.activeIndex) ? event.data.activeIndex : -1;
      record.paused = event.data.paused === true;
      record.forceLocate = event.data.forceLocate === true;
      renderTimeline(record);
      syncRecordVisibility();
    }
  }

  function handleTimelineClick(record, event) {
    const item = event.target instanceof Element ? event.target.closest('.dualsub-host-item') : null;
    if (!item) {
      return;
    }

    const index = Number(item.dataset.timelineIndex);
    const entry = record.entries[index];
    if (!entry) {
      return;
    }

    if (event.shiftKey) {
      selectTimelineRange(record, index);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      toggleTimelineSelection(record, index);
      return;
    }

    record.selectionAnchorIndex = index;
    record.iframe.contentWindow?.postMessage(
      {
        source: HOST_MESSAGE_SOURCE,
        type: 'timeline-seek',
        currentTime: entry.start,
      },
      '*'
    );
  }

  function locateCurrentTimelineItem(record) {
    const active = record.list.querySelector(`.dualsub-host-item[data-timeline-index="${record.activeIndex}"]`);
    ensureTimelineItemVisible(record, active, true);
  }

  function toggleTimelineSelection(record, index) {
    if (record.selectedIndexes.has(index)) {
      record.selectedIndexes.delete(index);
    } else {
      record.selectedIndexes.add(index);
    }
    record.selectionAnchorIndex = index;
    syncTimelineSelectionState(record);
  }

  function selectTimelineRange(record, index) {
    const anchorIndex = record.selectionAnchorIndex >= 0 ? record.selectionAnchorIndex : index;
    const start = Math.min(anchorIndex, index);
    const end = Math.max(anchorIndex, index);
    record.selectedIndexes.clear();
    for (let current = start; current <= end; current += 1) {
      record.selectedIndexes.add(current);
    }
    record.selectionAnchorIndex = anchorIndex;
    syncTimelineSelectionState(record);
  }

  function clearTimelineSelection(record) {
    record.selectedIndexes.clear();
    record.selectionAnchorIndex = -1;
    syncTimelineSelectionState(record);
  }

  function selectAllTimelineEntries(record) {
    if (!record.entries.length) {
      updateSelectionActionState(record);
      return;
    }
    record.selectedIndexes = new Set(record.entries.map((entry) => entry.index));
    record.selectionAnchorIndex = record.entries[record.entries.length - 1]?.index ?? -1;
    syncTimelineSelectionState(record);
  }

  function applyRecordState(record, index) {
    const saved = normalizeRecordState(record.state);
    record.state = saved;
    record.host.classList.toggle('dualsub-host-collapsed', saved.collapsed);
    record.toggleButton.textContent = saved.collapsed ? '展开' : '折叠';
    record.toggleButton.setAttribute('aria-expanded', String(!saved.collapsed));
    record.host.style.width = `${saved.width}px`;
    record.host.style.height = saved.collapsed ? 'auto' : `${saved.height}px`;

    if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      record.host.style.right = 'auto';
      record.host.style.bottom = 'auto';
      record.host.style.left = `${saved.left}px`;
      record.host.style.top = `${saved.top}px`;
      constrainRecordToViewport(record);
      return;
    }

    positionRecord(record, index);
  }

  function positionRecord(record, index) {
    const offset = Math.min(index, 4) * 18;
    record.host.style.left = '';
    record.host.style.top = '';
    record.host.style.right = `${24 + offset}px`;
    record.host.style.bottom = `${24 + offset}px`;
  }

  function toggleRecordCollapsed(record) {
    record.state.collapsed = !record.state.collapsed;
    record.host.classList.toggle('dualsub-host-collapsed', record.state.collapsed);
    record.toggleButton.textContent = record.state.collapsed ? '展开' : '折叠';
    record.toggleButton.setAttribute('aria-expanded', String(!record.state.collapsed));
    record.host.style.height = record.state.collapsed ? 'auto' : `${record.state.height}px`;
    persistRecordState(record);
  }

  function handleDragStart(record, event) {
    if (event.button !== 0 || !(event.target instanceof Element) || event.target.closest('button')) {
      return;
    }

    event.preventDefault();
    const rect = record.host.getBoundingClientRect();
    record.drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    record.host.classList.add('dualsub-host-dragging');
    record.heading.setPointerCapture(event.pointerId);
    record.heading.addEventListener('pointermove', record.handleDragMove || (record.handleDragMove = (moveEvent) => handleDragMove(record, moveEvent)));
    record.heading.addEventListener('pointerup', record.handleDragEnd || (record.handleDragEnd = (endEvent) => handleDragEnd(record, endEvent)));
    record.heading.addEventListener('pointercancel', record.handleDragEnd || (record.handleDragEnd = (endEvent) => handleDragEnd(record, endEvent)));
    record.host.style.right = 'auto';
    record.host.style.bottom = 'auto';
    record.host.style.left = `${rect.left}px`;
    record.host.style.top = `${rect.top}px`;
  }

  function handleDragMove(record, event) {
    if (!record.drag || event.pointerId !== record.drag.pointerId) {
      return;
    }

    const maxLeft = Math.max(8, window.innerWidth - record.host.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - record.host.offsetHeight - 8);
    const nextLeft = clamp(event.clientX - record.drag.offsetX, 8, maxLeft);
    const nextTop = clamp(event.clientY - record.drag.offsetY, 8, maxTop);
    record.host.style.left = `${nextLeft}px`;
    record.host.style.top = `${nextTop}px`;
  }

  function handleDragEnd(record, event) {
    if (!record.drag || event.pointerId !== record.drag.pointerId) {
      return;
    }

    record.state.left = parseFloat(record.host.style.left) || 0;
    record.state.top = parseFloat(record.host.style.top) || 0;
    persistRecordState(record);
    record.drag = null;
    record.host.classList.remove('dualsub-host-dragging');
    if (record.heading.hasPointerCapture(event.pointerId)) {
      record.heading.releasePointerCapture(event.pointerId);
    }
  }

  function handleResizeStart(record, event) {
    if (event.button !== 0 || record.state.collapsed) {
      return;
    }

    event.preventDefault();
    const rect = record.host.getBoundingClientRect();
    record.resize = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };
    record.host.classList.add('dualsub-host-resizing');
    record.resizeHandle.setPointerCapture(event.pointerId);
    record.resizeHandle.addEventListener(
      'pointermove',
      record.handleResizeMove || (record.handleResizeMove = (moveEvent) => handleResizeMove(record, moveEvent))
    );
    record.resizeHandle.addEventListener(
      'pointerup',
      record.handleResizeEnd || (record.handleResizeEnd = (endEvent) => handleResizeEnd(record, endEvent))
    );
    record.resizeHandle.addEventListener('pointercancel', record.handleResizeEnd);
  }

  function handleResizeMove(record, event) {
    if (!record.resize || event.pointerId !== record.resize.pointerId) {
      return;
    }

    const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - 16);
    const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - 16);
    const width = clamp(record.resize.startWidth + (event.clientX - record.resize.startX), MIN_WIDTH, maxWidth);
    const height = clamp(record.resize.startHeight + (event.clientY - record.resize.startY), MIN_HEIGHT, maxHeight);
    record.host.style.width = `${width}px`;
    record.host.style.height = `${height}px`;
  }

  function handleResizeEnd(record, event) {
    if (!record.resize || event.pointerId !== record.resize.pointerId) {
      return;
    }

    record.state.width = Math.round(record.host.getBoundingClientRect().width);
    record.state.height = Math.round(record.host.getBoundingClientRect().height);
    constrainRecordToViewport(record);
    persistRecordState(record);
    record.resize = null;
    record.host.classList.remove('dualsub-host-resizing');
    if (record.resizeHandle.hasPointerCapture(event.pointerId)) {
      record.resizeHandle.releasePointerCapture(event.pointerId);
    }
  }

  function renderTimeline(record) {
    pruneTimelineSelection(record);
    const markup = record.entries
      .map(
        (entry) => `
          <button type="button" class="dualsub-host-item${record.selectedIndexes.has(entry.index) ? ' is-selected' : ''}" data-timeline-index="${entry.index}">
            <span class="dualsub-host-time">${escapeHtml(formatTimelineTime(entry.start))}</span>
            <span class="dualsub-host-primary">${escapeHtml(entry.primaryText)}</span>
            ${entry.secondaryText ? `<span class="dualsub-host-secondary">${escapeHtml(entry.secondaryText)}</span>` : ''}
          </button>
        `
      )
      .join('');

    record.list.innerHTML = markup;
    record.empty.hidden = record.entries.length > 0;
    updateSelectionActionState(record);
    updateActiveTimelineItem(record);
  }

  function updateActiveTimelineItem(record) {
    const items = Array.from(record.list.querySelectorAll('.dualsub-host-item'));
    for (const item of items) {
      item.classList.remove('is-active');
      item.removeAttribute('aria-current');
    }

    if (record.activeIndex < 0) {
      return;
    }

    const active = record.list.querySelector(`.dualsub-host-item[data-timeline-index="${record.activeIndex}"]`);
    active?.classList.add('is-active');
    active?.setAttribute('aria-current', 'true');
    ensureTimelineItemVisible(record, active, record.forceLocate);
    record.forceLocate = false;
  }

  function syncTimelineSelectionState(record) {
    for (const item of Array.from(record.list.querySelectorAll('.dualsub-host-item'))) {
      const index = Number(item.dataset.timelineIndex);
      item.classList.toggle('is-selected', record.selectedIndexes.has(index));
    }
    updateSelectionActionState(record);
  }

  function updateSelectionActionState(record) {
    const hasSelection = record.selectedIndexes.size > 0;
    record.selectAllButton.disabled = record.entries.length === 0;
    record.clearButton.disabled = !hasSelection;
    record.shareButton.disabled = !hasSelection;
    record.exportButton.disabled = !hasSelection;
  }

  function pruneTimelineSelection(record) {
    const validIndexes = new Set(record.entries.map((entry) => entry.index));
    record.selectedIndexes = new Set([...record.selectedIndexes].filter((index) => validIndexes.has(index)));
    if (!validIndexes.has(record.selectionAnchorIndex)) {
      record.selectionAnchorIndex = -1;
    }
  }

  async function copyTimelineShareImage(record) {
    const selectedEntries = getSelectedTimelineEntries(record);
    if (!selectedEntries.length) {
      updateSelectionActionState(record);
      return;
    }

    const renderResult = renderShareImage(selectedEntries);
    if (!renderResult.ok) {
      window.alert(renderResult.message);
      return;
    }

    const blob = await canvasToBlob(renderResult.canvas);
    if (!blob) {
      window.alert('分享图片生成失败，请稍后重试。');
      return;
    }

    if (!navigator.clipboard?.write || typeof ClipboardItem !== 'function') {
      window.alert('当前浏览器不支持复制图片到剪贴板。');
      return;
    }

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type || 'image/png']: blob,
        }),
      ]);
      flashShareButtonSuccess(record);
    } catch (error) {
      console.debug('dualsub: failed to copy share image', error);
      window.alert('复制图片失败，请确认当前页面允许访问剪贴板。');
    }
  }

  function exportTimelineTxt(record) {
    const selectedEntries = getSelectedTimelineEntries(record);
    if (!selectedEntries.length) {
      updateSelectionActionState(record);
      return;
    }

    const content = buildTimelineTxtContent(selectedEntries);
    if (!content) {
      window.alert('当前选中的字幕没有可导出的文本内容。');
      return;
    }

    const fileName = buildTimelineTxtFileName();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, fileName);
    flashExportButtonSuccess(record);
  }

  function getSelectedTimelineEntries(record) {
    return record.entries.filter((entry) => record.selectedIndexes.has(entry.index));
  }

  function buildTimelineTxtContent(entries) {
    return entries
      .map((entry) => {
        const lines = [entry.primaryText, entry.secondaryText]
          .map((value) => String(value || '').trim())
          .filter(Boolean);
        return lines.join('\n');
      })
      .filter(Boolean)
      .join('\n\n');
  }

  function buildTimelineTxtFileName() {
    const title = sanitizeFileName(document.title || 'bilingual-subtitles');
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
    return `${title}-${stamp}.txt`;
  }

  function downloadBlob(blob, fileName) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  function renderShareImage(entries) {
    const pagePadding = 28;
    const cardPadding = 22;
    const headerTopInset = 8;
    const titleMetaGap = 6;
    const headerGap = 18;
    const blockPaddingY = 18;
    const blockInnerGap = 8;
    const blockGap = 16;
    const footerGap = 20;
    const width = 1120;
    const contentWidth = width - pagePadding * 2 - cardPadding * 2;
    const titleFont = '700 34px Arial';
    const metaFont = '500 20px Arial';
    const timeFont = '700 22px Arial';
    const primaryFont = '700 28px Arial';
    const secondaryFont = '500 24px Arial';
    const footerFont = '500 18px Arial';
    const titleLineHeight = 42;
    const metaLineHeight = 26;
    const timeLineHeight = 28;
    const primaryLineHeight = 34;
    const secondaryLineHeight = 30;
    const footerLineHeight = 22;

    const measureCanvas = document.createElement('canvas');
    const measureContext = measureCanvas.getContext('2d');
    if (!measureContext) {
      return { ok: false, message: '浏览器当前环境不支持图片导出。' };
    }

    const metaLines = wrapCanvasText(measureContext, document.title || location.href, metaFont, contentWidth);
    const blocks = entries.map((entry) => {
      const timeLines = wrapCanvasText(measureContext, formatTimelineTime(entry.start), timeFont, contentWidth);
      const primaryLines = wrapCanvasText(measureContext, entry.primaryText, primaryFont, contentWidth);
      const secondaryLines = wrapCanvasText(measureContext, entry.secondaryText || '', secondaryFont, contentWidth);
      const timeHeight = timeLines.length * timeLineHeight;
      const primaryHeight = primaryLines.length * primaryLineHeight;
      const secondaryHeight = secondaryLines.length ? secondaryLines.length * secondaryLineHeight : 0;
      const contentHeight =
        timeHeight +
        blockInnerGap +
        primaryHeight +
        (secondaryHeight ? blockInnerGap + secondaryHeight : 0);
      const height = blockPaddingY * 2 + contentHeight;
      return { timeLines, primaryLines, secondaryLines, height };
    });

    const headerHeight =
      headerTopInset +
      metaLines.length * metaLineHeight;
    const blocksHeight = blocks.reduce((sum, block, index) => sum + block.height + (index > 0 ? blockGap : 0), 0);
    const totalHeight =
      pagePadding * 2 +
      cardPadding * 2 +
      headerHeight +
      headerGap +
      blocksHeight +
      footerGap +
      footerLineHeight;

    if (totalHeight > MAX_SHARE_EXPORT_HEIGHT) {
      return { ok: false, message: '选中的字幕内容过多，请减少后再分享。' };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.max(420, Math.ceil(totalHeight));
    const context = canvas.getContext('2d');
    if (!context) {
      return { ok: false, message: '浏览器当前环境不支持图片导出。' };
    }

    context.fillStyle = '#08111d';
    context.fillRect(0, 0, canvas.width, canvas.height);

    drawRoundedRect(context, pagePadding, pagePadding, width - pagePadding * 2, canvas.height - pagePadding * 2, 24, '#0f1c2d');
    drawRoundedRect(context, pagePadding + 1, pagePadding + 1, width - pagePadding * 2 - 2, canvas.height - pagePadding * 2 - 2, 24);
    context.strokeStyle = 'rgba(127, 208, 255, 0.22)';
    context.lineWidth = 2;
    context.stroke();

    let cursorY = pagePadding + cardPadding + headerTopInset;
    cursorY = drawCanvasLines(context, metaLines, pagePadding + cardPadding, cursorY, metaLineHeight, metaFont, '#a9bddf');
    cursorY += headerGap;

    blocks.forEach((block, index) => {
      if (index > 0) {
        cursorY += blockGap;
      }
      drawRoundedRect(
        context,
        pagePadding + cardPadding - 8,
        cursorY,
        contentWidth + 16,
        block.height,
        16,
        'rgba(127, 208, 255, 0.08)'
      );
      let blockCursorY = cursorY + blockPaddingY;
      blockCursorY = drawCanvasLines(context, block.timeLines, pagePadding + cardPadding + 6, blockCursorY, timeLineHeight, timeFont, '#7fd0ff');
      blockCursorY += blockInnerGap;
      blockCursorY = drawCanvasLines(context, block.primaryLines, pagePadding + cardPadding + 6, blockCursorY, primaryLineHeight, primaryFont, '#ffffff');
      if (block.secondaryLines.length) {
        blockCursorY += blockInnerGap;
        blockCursorY = drawCanvasLines(context, block.secondaryLines, pagePadding + cardPadding + 6, blockCursorY, secondaryLineHeight, secondaryFont, '#cfe0ff');
      }
      cursorY += block.height;
    });

    context.font = footerFont;
    context.fillStyle = '#7f8fa8';
    context.textBaseline = 'top';
    context.fillText('Generated by MediaDelivery Dual Subtitles', pagePadding + cardPadding, cursorY + footerGap);

    return { ok: true, canvas };
  }

  function ensureTimelineItemVisible(record, item, force) {
    if (!record || !item || record.host.hidden) {
      return;
    }

    if (!force && (document.hidden || record.paused)) {
      return;
    }

    const containerRect = record.list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();

    if (itemRect.top < containerRect.top) {
      record.list.scrollTop -= containerRect.top - itemRect.top;
      return;
    }
    if (itemRect.bottom > containerRect.bottom) {
      record.list.scrollTop += itemRect.bottom - containerRect.bottom;
    }
  }

  function syncRecordVisibility() {
    for (const record of records) {
      const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || null;
      const isFullscreen = Boolean(fullscreenElement && fullscreenElement.contains(record.iframe));
      record.host.hidden = isFullscreen || !record.entries.length;
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

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function handleWindowResize() {
    for (const record of records) {
      constrainRecordToViewport(record);
    }
  }

  function constrainRecordToViewport(record) {
    const rect = record.host.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);

    if (record.host.style.left) {
      const nextLeft = clamp(parseFloat(record.host.style.left) || 0, 8, maxLeft);
      record.host.style.left = `${nextLeft}px`;
      record.state.left = nextLeft;
    }

    if (record.host.style.top) {
      const nextTop = clamp(parseFloat(record.host.style.top) || 0, 8, maxTop);
      record.host.style.top = `${nextTop}px`;
      record.state.top = nextTop;
    }
  }

  function loadRecordState() {
    try {
      const raw = localStorage.getItem(getRecordStorageKey());
      return raw ? normalizeRecordState(JSON.parse(raw)) : normalizeRecordState({});
    } catch {
      return normalizeRecordState({});
    }
  }

  function persistRecordState(record) {
    try {
      localStorage.setItem(getRecordStorageKey(), JSON.stringify(normalizeRecordState(record.state)));
    } catch {}
  }

  function getRecordStorageKey() {
    return STORAGE_KEY;
  }

  function normalizeRecordState(value) {
    const state = value && typeof value === 'object' ? value : {};
    return {
      left: Number.isFinite(Number(state.left)) ? Number(state.left) : null,
      top: Number.isFinite(Number(state.top)) ? Number(state.top) : null,
      width: clamp(Number(state.width) || DEFAULT_WIDTH, MIN_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - 16)),
      height: clamp(Number(state.height) || DEFAULT_HEIGHT, MIN_HEIGHT, Math.max(MIN_HEIGHT, window.innerHeight - 16)),
      collapsed: state.collapsed === true,
    };
  }

  function wrapCanvasText(context, text, font, maxWidth) {
    const normalized = String(text || '').trim();
    if (!normalized) {
      return [];
    }

    context.font = font;
    const segments = normalized.split(/\r?\n/);
    const lines = [];

    for (const segment of segments) {
      let currentLine = '';
      for (const char of segment) {
        const nextLine = currentLine + char;
        if (currentLine && context.measureText(nextLine).width > maxWidth) {
          lines.push(currentLine);
          currentLine = char;
        } else {
          currentLine = nextLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      } else if (!segment) {
        lines.push('');
      }
    }

    return lines;
  }

  function drawCanvasLines(context, lines, x, startY, lineHeight, font, color) {
    context.font = font;
    context.fillStyle = color;
    context.textBaseline = 'top';
    let cursorY = startY;
    for (const line of lines) {
      context.fillText(line, x, cursorY);
      cursorY += lineHeight;
    }
    return cursorY;
  }

  function drawRoundedRect(context, x, y, width, height, radius, fillStyle) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
    if (fillStyle) {
      context.fillStyle = fillStyle;
      context.fill();
    }
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  function flashShareButtonSuccess(record) {
    if (!record?.shareButton) {
      return;
    }
    const originalText = record.shareButton.textContent || '复制图片';
    record.shareButton.textContent = '已复制';
    record.shareButton.disabled = true;
    window.setTimeout(() => {
      record.shareButton.textContent = originalText;
      updateSelectionActionState(record);
    }, 1200);
  }

  function flashExportButtonSuccess(record) {
    if (!record?.exportButton) {
      return;
    }
    const originalText = record.exportButton.textContent || '导出 TXT';
    record.exportButton.textContent = '已导出';
    record.exportButton.disabled = true;
    window.setTimeout(() => {
      record.exportButton.textContent = originalText;
      updateSelectionActionState(record);
    }, 1200);
  }

  function sanitizeFileName(value) {
    return String(value || '')
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'bilingual-subtitles';
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
