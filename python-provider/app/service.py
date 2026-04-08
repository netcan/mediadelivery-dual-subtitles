from __future__ import annotations

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


def process_job(job: Job, config: ProviderConfig, store: JobStore, adapter: BaseTtsAdapter) -> dict:
    store.update_job(job.job_id, status="running", error=None)
    try:
        cues = job.request.get("subtitles", {}).get("cues", [])
        segments = build_synthesis_segments(cues)
        subtitle_cues = build_subtitle_cues(cues)
        voice_id = (job.request.get("provider", {}) or {}).get("voicePreset") or config.default_voice

        rendered_segments = []
        sample_rate = None
        for segment in segments:
            synthesized = adapter.synthesize(segment["text"], voice_id=voice_id)
            sample_rate = sample_rate or synthesized.sample_rate
            if synthesized.sample_rate != sample_rate:
                raise ValidationError("当前实现要求所有分段使用相同采样率。")
            rendered_segments.append(
                {
                    "start": segment["start"],
                    "end": segment["end"],
                    "text": segment["text"],
                    "cueCount": segment["cueCount"],
                    "samples": synthesized.samples,
                }
            )

        if not rendered_segments or sample_rate is None:
            raise ValidationError("未生成任何可写入的配音音频。")

        mixed = mix_timeline(rendered_segments, sample_rate=sample_rate)
        config.output_dir.mkdir(parents=True, exist_ok=True)

        file_base_name = _sanitize_file_name(job.job_id)
        audio_name = f"{file_base_name}.wav"
        subtitle_name = f"{file_base_name}.vtt"
        audio_path = Path(config.output_dir, audio_name)
        subtitle_path = Path(config.output_dir, subtitle_name)

        write_wave_file(audio_path, mixed, sample_rate=sample_rate)
        subtitle_path.write_text(build_vtt(subtitle_cues), encoding="utf-8")

        result = {
            "jobId": job.job_id,
            "audioUrl": f"{job.base_url}/files/{audio_name}",
            "subtitleUrl": f"{job.base_url}/files/{subtitle_name}",
            "segments": [
                {
                    "start": segment["start"],
                    "end": segment["end"],
                    "text": segment["text"],
                    "cueCount": segment["cueCount"],
                    "audioDurationSec": round(len(segment["samples"]) / sample_rate, 3),
                    "voicePreset": voice_id,
                }
                for segment in rendered_segments
            ],
            "audioOffsetSec": 0,
        }
        store.update_job(job.job_id, status="done", result=result, error=None)
        return result
    except Exception as error:
        store.update_job(job.job_id, status="failed", error=to_error_envelope(error))
        raise
