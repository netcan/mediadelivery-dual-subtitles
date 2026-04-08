from __future__ import annotations


def _format_timestamp(total_seconds: float) -> str:
    seconds = max(0.0, float(total_seconds or 0.0))
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    whole_seconds = int(seconds % 60)
    milliseconds = int(round((seconds - int(seconds)) * 1000))
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d}.{milliseconds:03d}"


def build_vtt(cues: list[dict]) -> str:
    lines = ["WEBVTT", ""]
    for cue in cues:
        lines.append(f"{_format_timestamp(cue['start'])} --> {_format_timestamp(cue['end'])}")
        lines.append(str(cue["text"]).strip())
        lines.append("")
    return "\n".join(lines) + "\n"
