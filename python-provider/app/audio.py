from __future__ import annotations

from array import array
import math
import wave

from .errors import ModelInvokeError


def generate_tone_samples(duration_sec: float, sample_rate: int = 24000, frequency: float = 220.0) -> array:
    frame_count = max(1, int(duration_sec * sample_rate))
    samples = array("f")
    for index in range(frame_count):
        time_value = index / sample_rate
        fade_in = min(1.0, index / max(1, int(sample_rate * 0.04)))
        fade_out = min(1.0, (frame_count - index) / max(1, int(sample_rate * 0.05)))
        envelope = max(0.0, min(fade_in, fade_out))
        samples.append(math.sin(2 * math.pi * frequency * time_value) * 0.18 * envelope)
    return samples


def _average_rows(rows: list[list[float]]) -> list[float]:
    if not rows:
        return []
    row_length = len(rows[0])
    result = [0.0] * row_length
    for row in rows:
        for index, value in enumerate(row):
            result[index] += float(value)
    return [value / len(rows) for value in result]


def coerce_mono_samples(raw_audio) -> array:
    if raw_audio is None:
        raise ModelInvokeError("模型未返回音频数据。")

    if hasattr(raw_audio, "tolist"):
        raw_audio = raw_audio.tolist()

    if isinstance(raw_audio, (int, float)):
        return array("f", [float(raw_audio)])

    if not isinstance(raw_audio, (list, tuple)):
        raise ModelInvokeError("模型返回了无法识别的音频数据结构。")

    if raw_audio and isinstance(raw_audio[0], (list, tuple)):
        rows = [list(map(float, row)) for row in raw_audio if isinstance(row, (list, tuple))]
        if not rows:
            raise ModelInvokeError("模型返回了空音频。")
        if len(rows) <= 8 and all(len(row) == len(rows[0]) for row in rows):
            return array("f", _average_rows(rows))
        flattened: list[float] = []
        for row in rows:
            flattened.extend(row)
        return array("f", flattened)

    return array("f", [float(value) for value in raw_audio])


def mix_timeline(entries: list[dict], sample_rate: int, tail_pad_sec: float = 0.25) -> array:
    total_frames = max(1, int(tail_pad_sec * sample_rate))
    prepared_entries = []
    for entry in entries:
        start_frame = max(0, int(entry["start"] * sample_rate))
        samples = entry["samples"]
        total_frames = max(total_frames, start_frame + len(samples) + int(tail_pad_sec * sample_rate))
        prepared_entries.append({"start_frame": start_frame, "samples": samples})

    mixed = array("f", [0.0]) * total_frames
    for entry in prepared_entries:
        samples = entry["samples"]
        start_frame = entry["start_frame"]
        for index, value in enumerate(samples):
            mixed[start_frame + index] += value

    peak = max((abs(value) for value in mixed), default=0.0)
    if peak > 0.98:
      gain = 0.98 / peak
      for index in range(len(mixed)):
          mixed[index] *= gain

    return mixed


def write_wave_file(file_path, samples: array, sample_rate: int) -> None:
    pcm = array("h")
    for value in samples:
        clipped = max(-1.0, min(1.0, float(value)))
        pcm.append(int(round(clipped * 32767)))

    with wave.open(str(file_path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm.tobytes())
