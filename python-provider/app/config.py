from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _parse_float(value: str | None, default: float) -> float:
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def _parse_int(value: str | None, default: int) -> int:
    try:
        return int(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def _coalesce_str(override, env_value: str | None, default: str) -> str:
    value = override if override is not None else env_value
    if value is None:
        return default
    return str(value)


def _coalesce_int(override, env_value: str | None, default: int) -> int:
    return _parse_int(override if override is not None else env_value, default)


def _coalesce_float(override, env_value: str | None, default: float) -> float:
    return _parse_float(override if override is not None else env_value, default)


def _coalesce_bool(override, env_value: str | None, default: bool) -> bool:
    if override is not None:
        return bool(override)
    return _parse_bool(env_value, default)


@dataclass
class VoicePreset:
    voice_id: str
    label: str
    cfg_value: float | None = None
    inference_timesteps: int | None = None
    generate_kwargs: dict = field(default_factory=dict)

    def to_public_dict(self) -> dict:
        payload = {
            "id": self.voice_id,
            "label": self.label,
        }
        if self.cfg_value is not None:
            payload["cfgValue"] = self.cfg_value
        if self.inference_timesteps is not None:
            payload["inferenceTimesteps"] = self.inference_timesteps
        return payload


@dataclass
class ProviderConfig:
    host: str
    port: int
    base_url: str
    response_mode: str
    output_dir: Path
    max_workers: int
    sample_rate: int
    preload_model: bool
    enable_mock: bool
    model_id: str
    load_denoiser: bool
    default_cfg_value: float
    default_inference_timesteps: int
    default_voice: str
    voice_presets: dict[str, VoicePreset]


def _parse_voice_presets(raw_value: str | None) -> dict[str, VoicePreset]:
    default_presets = {
        "default": VoicePreset(voice_id="default", label="默认音色"),
        "warm": VoicePreset(voice_id="warm", label="温和", cfg_value=2.2, inference_timesteps=12),
    }
    if not raw_value:
        return default_presets

    try:
        data = json.loads(raw_value)
    except json.JSONDecodeError:
        return default_presets

    presets: dict[str, VoicePreset] = {}
    if isinstance(data, list):
        for item in data:
            if isinstance(item, str) and item.strip():
                presets[item.strip()] = VoicePreset(voice_id=item.strip(), label=item.strip())
    elif isinstance(data, dict):
        for voice_id, item in data.items():
            if not voice_id:
                continue
            if isinstance(item, str):
                presets[voice_id] = VoicePreset(voice_id=voice_id, label=item)
                continue
            if not isinstance(item, dict):
                continue
            presets[voice_id] = VoicePreset(
                voice_id=voice_id,
                label=str(item.get("label") or item.get("name") or voice_id),
                cfg_value=float(item["cfg_value"]) if item.get("cfg_value") is not None else None,
                inference_timesteps=int(item["inference_timesteps"])
                if item.get("inference_timesteps") is not None
                else None,
                generate_kwargs=item.get("generate_kwargs") if isinstance(item.get("generate_kwargs"), dict) else {},
            )

    return presets or default_presets


def load_config(overrides: dict | None = None) -> ProviderConfig:
    overrides = overrides or {}
    root_dir = Path(__file__).resolve().parent.parent
    host = _coalesce_str(overrides.get("host"), os.getenv("PYTHON_PROVIDER_HOST"), "127.0.0.1").strip() or "127.0.0.1"
    port = _coalesce_int(overrides.get("port"), os.getenv("PYTHON_PROVIDER_PORT") or os.getenv("PORT"), 8000)
    base_url = _coalesce_str(overrides.get("base_url"), os.getenv("PYTHON_PROVIDER_BASE_URL"), "").strip()
    response_mode_raw = _coalesce_str(overrides.get("response_mode"), os.getenv("PYTHON_PROVIDER_RESPONSE_MODE"), "async")
    response_mode = "sync" if response_mode_raw.strip().lower() == "sync" else "async"
    output_dir = Path(
        _coalesce_str(overrides.get("output_dir"), os.getenv("PYTHON_PROVIDER_OUTPUT_DIR"), str(root_dir / "output"))
    ).resolve()
    voice_presets = _parse_voice_presets(
        _coalesce_str(overrides.get("voice_presets_json"), os.getenv("VOXCPM_VOICE_PRESETS_JSON"), "")
    )
    default_voice = _coalesce_str(
        overrides.get("default_voice"),
        os.getenv("VOXCPM_DEFAULT_VOICE"),
        next(iter(voice_presets.keys()), "default"),
    ).strip() or next(iter(voice_presets.keys()), "default")

    return ProviderConfig(
        host=host,
        port=port,
        base_url=base_url.rstrip("/"),
        response_mode=response_mode,
        output_dir=output_dir,
        max_workers=max(1, _coalesce_int(overrides.get("max_workers"), os.getenv("PYTHON_PROVIDER_MAX_WORKERS"), 2)),
        sample_rate=max(8000, _coalesce_int(overrides.get("sample_rate"), os.getenv("VOXCPM_SAMPLE_RATE"), 24000)),
        preload_model=_coalesce_bool(overrides.get("preload_model"), os.getenv("VOXCPM_PRELOAD_MODEL"), True),
        enable_mock=_coalesce_bool(overrides.get("enable_mock"), os.getenv("VOXCPM_ENABLE_MOCK"), False),
        model_id=_coalesce_str(overrides.get("model_id"), os.getenv("VOXCPM_MODEL_ID"), "openbmb/VoxCPM2"),
        load_denoiser=_coalesce_bool(overrides.get("load_denoiser"), os.getenv("VOXCPM_LOAD_DENOISER"), False),
        default_cfg_value=_coalesce_float(overrides.get("default_cfg_value"), os.getenv("VOXCPM_CFG_VALUE"), 2.0),
        default_inference_timesteps=max(
            1,
            _coalesce_int(overrides.get("default_inference_timesteps"), os.getenv("VOXCPM_INFERENCE_TIMESTEPS"), 10),
        ),
        default_voice=default_voice,
        voice_presets=voice_presets,
    )
