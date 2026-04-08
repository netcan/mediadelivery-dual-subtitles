from __future__ import annotations

from copy import deepcopy
from pathlib import Path

from .adapters import BaseTtsAdapter
from .audio import mix_timeline, write_wave_file
from .config import ProviderConfig
from .errors import ValidationError, to_error_envelope
from .job_store import Job, JobStore
from .preprocess import build_subtitle_cues, build_synthesis_segments
from .subtitles import build_vtt


def _sanitize_file_name(value: str) -> str:
    sanitized = "".join(character if character.isalnum() or character in "._-" else "-" for character in value)
    while "--" in sanitized:
        sanitized = sanitized.replace("--", "-")
    return sanitized.strip("-") or "job"


def _build_file_url(base_url: str, *parts: str) -> str:
    safe_parts = [part.strip("/") for part in parts if str(part).strip("/")]
    return f"{base_url}/files/{'/'.join(safe_parts)}"


def _build_playback_state(segments: list[dict], total_duration_sec: float) -> dict:
    ready_segments = [segment for segment in segments if segment.get("status") == "done" and segment.get("audioUrl")]
    ready_segment_count = len(ready_segments)
    ready_through_sec = ready_segments[-1]["end"] if ready_segments else 0.0
    target_window_sec = min(8.0, max(total_duration_sec, 0.0))
    playable = ready_segment_count > 0 and (ready_through_sec >= target_window_sec or ready_segment_count == len(segments))
    return {
        "mode": "segmented",
        "playable": playable,
        "readySegmentCount": ready_segment_count,
        "readyThroughSec": round(ready_through_sec, 3),
        "targetPlayableWindowSec": round(target_window_sec, 3),
        "totalSegments": len(segments),
    }


def process_job(job: Job, config: ProviderConfig, store: JobStore, adapter: BaseTtsAdapter) -> dict:
    store.update_job(job.job_id, status="running", error=None)
    try:
        cues = job.request.get("subtitles", {}).get("cues", [])
        segments = build_synthesis_segments(cues)
        subtitle_cues = build_subtitle_cues(cues)
        voice_id = (job.request.get("provider", {}) or {}).get("voicePreset") or config.default_voice
        total_duration_sec = max((segment["end"] for segment in segments), default=0.0)

        config.output_dir.mkdir(parents=True, exist_ok=True)
        job_dir_name = _sanitize_file_name(job.job_id)
        job_output_dir = Path(config.output_dir, job_dir_name)
        job_output_dir.mkdir(parents=True, exist_ok=True)
        subtitle_name = "result.vtt"
        subtitle_path = job_output_dir / subtitle_name
        subtitle_path.write_text(build_vtt(subtitle_cues), encoding="utf-8")

        segment_results = [
            {
                "index": index,
                "start": segment["start"],
                "end": segment["end"],
                "text": segment["text"],
                "cueCount": segment["cueCount"],
                "status": "pending",
                "audioUrl": "",
                "audioDurationSec": 0,
                "voicePreset": voice_id,
            }
            for index, segment in enumerate(segments)
        ]
        result = {
            "jobId": job.job_id,
            "subtitleUrl": _build_file_url(job.base_url, job_dir_name, subtitle_name),
            "segments": segment_results,
            "audioOffsetSec": 0,
            "playback": _build_playback_state(segment_results, total_duration_sec),
        }
        store.update_job(job.job_id, status="running", result=deepcopy(result), error=None)

        rendered_segments = []
        sample_rate = None
        for index, segment in enumerate(segments):
            synthesized = adapter.synthesize(segment["text"], voice_id=voice_id)
            sample_rate = sample_rate or synthesized.sample_rate
            if synthesized.sample_rate != sample_rate:
                raise ValidationError("当前实现要求所有分段使用相同采样率。")

            segment_name = f"segment-{index:04d}.wav"
            segment_path = job_output_dir / segment_name
            write_wave_file(segment_path, synthesized.samples, sample_rate=synthesized.sample_rate)

            rendered_segments.append(
                {
                    "start": segment["start"],
                    "end": segment["end"],
                    "text": segment["text"],
                    "cueCount": segment["cueCount"],
                    "samples": synthesized.samples,
                }
            )
            segment_results[index].update(
                {
                    "status": "done",
                    "audioUrl": _build_file_url(job.base_url, job_dir_name, segment_name),
                    "audioDurationSec": round(len(synthesized.samples) / synthesized.sample_rate, 3),
                }
            )
            result["playback"] = _build_playback_state(segment_results, total_duration_sec)
            store.update_job(job.job_id, status="running", result=deepcopy(result), error=None)

        if not rendered_segments or sample_rate is None:
            raise ValidationError("未生成任何可写入的配音音频。")

        mixed = mix_timeline(rendered_segments, sample_rate=sample_rate)
        audio_name = "result.wav"
        audio_path = job_output_dir / audio_name
        write_wave_file(audio_path, mixed, sample_rate=sample_rate)

        result["audioUrl"] = _build_file_url(job.base_url, job_dir_name, audio_name)
        result["playback"] = {
            **_build_playback_state(segment_results, total_duration_sec),
            "playable": True,
            "complete": True,
        }
        store.update_job(job.job_id, status="done", result=result, error=None)
        return result
    except Exception as error:
        store.update_job(job.job_id, status="failed", error=to_error_envelope(error))
        raise
