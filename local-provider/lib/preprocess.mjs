import { PreprocessError } from './errors.mjs';

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(text) {
  return text.replace(/<[^>]+>/g, ' ');
}

function stripStageDirections(text) {
  return text
    .replace(/^\s*[\[(（【][^\])）】]{0,24}[\])）】]\s*/g, '')
    .replace(/\s*[\[(（【][^\])）】]{0,24}[\])）】]\s*$/g, '')
    .trim();
}

function normalizePunctuation(text) {
  return text
    .replace(/[~～]{2,}/g, '～')
    .replace(/[!！]{2,}/g, '！')
    .replace(/[?？]{2,}/g, '？')
    .replace(/[,.，。]{3,}/g, '。')
    .replace(/\s*([，。！？；：])/g, '$1')
    .replace(/([，。！？；：])(?=[^\s，。！？；：])/g, '$1 ')
    .trim();
}

function ensureSentenceEnding(text) {
  if (!text) {
    return '';
  }
  if (/[。！？!?]$/.test(text)) {
    return text;
  }
  return `${text}。`;
}

function cueToNaturalText(text) {
  const cleaned = normalizePunctuation(stripStageDirections(stripHtml(normalizeWhitespace(text))));
  return cleaned;
}

function makeSeparator(currentText) {
  if (!currentText) {
    return '';
  }
  return /[。！？!?；;]$/.test(currentText) ? ' ' : '，';
}

export function normalizeCueList(rawCues) {
  if (!Array.isArray(rawCues) || !rawCues.length) {
    throw new PreprocessError('未收到可用字幕分段。');
  }

  const cues = rawCues
    .map((cue, index) => ({
      index,
      start: Number(cue?.start),
      end: Number(cue?.end),
      text: cueToNaturalText(cue?.text),
    }))
    .filter((cue) => cue.text);

  if (!cues.length) {
    throw new PreprocessError('字幕在清洗后为空，无法生成配音。');
  }

  for (const cue of cues) {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start) {
      throw new PreprocessError(`字幕时间轴无效：第 ${cue.index + 1} 条字幕缺少有效 start/end。`);
    }
  }

  return cues;
}

export function buildSubtitleOutputCues(rawCues) {
  return normalizeCueList(rawCues).map((cue) => ({
    start: cue.start,
    end: cue.end,
    text: cue.text,
  }));
}

export function buildSynthesisSegments(rawCues) {
  const cues = normalizeCueList(rawCues);
  const segments = [];
  const maxMergedLength = 58;
  const maxGapSec = 0.45;

  for (const cue of cues) {
    const previous = segments[segments.length - 1];
    if (!previous) {
      segments.push({
        start: cue.start,
        end: cue.end,
        text: ensureSentenceEnding(cue.text),
        cueCount: 1,
      });
      continue;
    }

    const mergedLength = previous.text.length + cue.text.length;
    const gapSec = Math.max(0, cue.start - previous.end);
    const shouldMerge =
      gapSec <= maxGapSec &&
      mergedLength <= maxMergedLength &&
      !/[。！？!?；;]$/.test(previous.text.slice(-1));

    if (shouldMerge) {
      previous.text = ensureSentenceEnding(`${previous.text.replace(/[。！？!?]$/, '')}${makeSeparator(previous.text)}${cue.text}`);
      previous.end = cue.end;
      previous.cueCount += 1;
      continue;
    }

    segments.push({
      start: cue.start,
      end: cue.end,
      text: ensureSentenceEnding(cue.text),
      cueCount: 1,
    });
  }

  if (!segments.length) {
    throw new PreprocessError('字幕未生成可配音分段。');
  }

  return segments;
}
