from __future__ import annotations

from dataclasses import dataclass
from threading import Lock

from .audio import coerce_mono_samples, generate_tone_samples
from .config import ProviderConfig
from .errors import ModelInvokeError, ModelUnavailableError


@dataclass
class SynthesizedAudio:
    samples: object
    sample_rate: int


class BaseTtsAdapter:
    def get_capabilities(self) -> dict:
        raise NotImplementedError

    def synthesize(self, text: str, voice_id: str | None = None) -> SynthesizedAudio:
        raise NotImplementedError

    def is_ready(self) -> bool:
        raise NotImplementedError


class VoxCpmAdapter(BaseTtsAdapter):
    def __init__(self, config: ProviderConfig) -> None:
        self.config = config
        self._model = None
        self._model_lock = Lock()
        if config.preload_model and not config.enable_mock:
            self._ensure_model()

    def _ensure_model(self):
        if self.config.enable_mock:
            return None
        with self._model_lock:
            if self._model is not None:
                return self._model
            try:
                from voxcpm import VoxCPM
            except Exception as error:
                raise ModelUnavailableError(f"无法导入 VoxCPM：{error}") from error

            try:
                self._model = VoxCPM.from_pretrained(
                    self.config.model_id,
                    load_denoiser=self.config.load_denoiser,
                )
            except Exception as error:
                raise ModelUnavailableError(f"VoxCPM 模型加载失败：{error}") from error
            return self._model

    def _resolve_voice(self, voice_id: str | None):
        voice_key = (voice_id or self.config.default_voice or "").strip() or self.config.default_voice
        return self.config.voice_presets.get(voice_key) or self.config.voice_presets.get(self.config.default_voice)

    def get_capabilities(self) -> dict:
        return {
            "provider": "voxcpm",
            "defaultVoice": self.config.default_voice,
            "voices": [preset.to_public_dict() for preset in self.config.voice_presets.values()],
            "supports": {
                "async": True,
                "subtitleDriven": True,
                "voiceSelect": True,
            },
            "modelId": self.config.model_id,
            "ready": self.is_ready(),
        }

    def is_ready(self) -> bool:
        return self.config.enable_mock or self._model is not None

    def synthesize(self, text: str, voice_id: str | None = None) -> SynthesizedAudio:
        preset = self._resolve_voice(voice_id)
        if preset is None:
            raise ModelInvokeError(f"未找到可用音色：{voice_id or self.config.default_voice}")

        if self.config.enable_mock:
            voice_index = list(self.config.voice_presets.keys()).index(preset.voice_id)
            return SynthesizedAudio(
                samples=generate_tone_samples(
                    duration_sec=min(6.0, max(0.45, len(text) * 0.11)),
                    sample_rate=self.config.sample_rate,
                    frequency=180 + voice_index * 35,
                ),
                sample_rate=self.config.sample_rate,
            )

        model = self._ensure_model()
        kwargs = {
            "text": text,
            "cfg_value": preset.cfg_value if preset.cfg_value is not None else self.config.default_cfg_value,
            "inference_timesteps": (
                preset.inference_timesteps
                if preset.inference_timesteps is not None
                else self.config.default_inference_timesteps
            ),
        }
        if preset.generate_kwargs:
            kwargs.update(preset.generate_kwargs)

        try:
            generated = model.generate(**kwargs)
        except Exception as error:
            raise ModelInvokeError(f"VoxCPM 合成失败：{error}") from error

        sample_rate = getattr(getattr(model, "tts_model", None), "sample_rate", None) or self.config.sample_rate
        samples = coerce_mono_samples(generated)
        if not samples:
            raise ModelInvokeError("VoxCPM 返回了空音频。")

        return SynthesizedAudio(samples=samples, sample_rate=int(sample_rate))
