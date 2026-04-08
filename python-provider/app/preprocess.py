from __future__ import annotations

import re

from .errors import PreprocessError


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").replace("\r\n", "\n")).strip()


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text)


def _strip_stage_directions(text: str) -> str:
    text = re.sub(r"^\s*[\[(（【][^\])）】]{0,24}[\])）】]\s*", "", text)
    text = re.sub(r"\s*[\[(（【][^\])）】]{0,24}[\])）】]\s*$", "", text)
    return text.strip()


def _normalize_punctuation(text: str) -> str:
    text = re.sub(r"[~～]{2,}", "～", text)
    text = re.sub(r"[!！]{2,}", "！", text)
    text = re.sub(r"[?？]{2,}", "？", text)
    text = re.sub(r"[,.，。]{3,}", "。", text)
    text = re.sub(r"\s*([，。！？；：])", r"\1", text)
    text = re.sub(r"([，。！？；：])(?=[^\s，。！？；：])", r"\1 ", text)
    return text.strip()


def _ensure_sentence_end(text: str) -> str:
    if not text:
        return ""
    if re.search(r"[。！？!?]$", text):
        return text
    return f"{text}。"


def _cue_to_natural_text(text: str) -> str:
    return _normalize_punctuation(_strip_stage_directions(_strip_html(_normalize_whitespace(text))))


def _make_separator(current_text: str) -> str:
    if not current_text:
        return ""
    return " " if re.search(r"[。！？!?；;]$", current_text) else "，"


def normalize_cues(raw_cues: list[dict]) -> list[dict]:
    if not isinstance(raw_cues, list) or not raw_cues:
        raise PreprocessError("未收到可用字幕分段。")

    cues: list[dict] = []
    for index, cue in enumerate(raw_cues):
        start = float(cue.get("start")) if cue.get("start") is not None else None
        end = float(cue.get("end")) if cue.get("end") is not None else None
        text = _cue_to_natural_text(str(cue.get("text") or ""))
        if not text:
            continue
        if start is None or end is None or start < 0 or end <= start:
            raise PreprocessError(f"字幕时间轴无效：第 {index + 1} 条字幕缺少有效 start/end。")
        cues.append({"index": index, "start": start, "end": end, "text": text})

    if not cues:
        raise PreprocessError("字幕在清洗后为空，无法生成配音。")

    return cues


def build_subtitle_cues(raw_cues: list[dict]) -> list[dict]:
    return [{"start": cue["start"], "end": cue["end"], "text": cue["text"]} for cue in normalize_cues(raw_cues)]


def build_synthesis_segments(raw_cues: list[dict]) -> list[dict]:
    cues = normalize_cues(raw_cues)
    segments: list[dict] = []
    max_merged_length = 58
    max_gap_sec = 0.45

    for cue in cues:
        previous = segments[-1] if segments else None
        if previous is None:
            segments.append(
                {
                    "start": cue["start"],
                    "end": cue["end"],
                    "text": _ensure_sentence_end(cue["text"]),
                    "cueCount": 1,
                }
            )
            continue

        merged_length = len(previous["text"]) + len(cue["text"])
        gap_sec = max(0.0, cue["start"] - previous["end"])
        should_merge = gap_sec <= max_gap_sec and merged_length <= max_merged_length and not re.search(
            r"[。！？!?；;]$",
            previous["text"],
        )

        if should_merge:
            previous["text"] = _ensure_sentence_end(
                f"{re.sub(r'[。！？!?]$', '', previous['text'])}{_make_separator(previous['text'])}{cue['text']}"
            )
            previous["end"] = cue["end"]
            previous["cueCount"] += 1
            continue

        segments.append(
            {
                "start": cue["start"],
                "end": cue["end"],
                "text": _ensure_sentence_end(cue["text"]),
                "cueCount": 1,
            }
        )

    if not segments:
        raise PreprocessError("字幕未生成可配音分段。")

    return segments
