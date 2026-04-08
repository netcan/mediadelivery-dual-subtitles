import argparse
import sys
from pathlib import Path


CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from app.config import load_config
from app.http_server import run_server


def parse_args():
    parser = argparse.ArgumentParser(description="Run the VoxCPM Python provider.")
    parser.add_argument("--host", help="Provider listen host, e.g. 127.0.0.1 or 0.0.0.0")
    parser.add_argument("--port", type=int, help="Provider listen port")
    parser.add_argument("--base-url", dest="base_url", help="Public base URL returned in job result links")
    parser.add_argument("--response-mode", choices=("async", "sync"), help="Job response mode")
    parser.add_argument("--output-dir", dest="output_dir", help="Output directory for generated wav/vtt files")
    parser.add_argument("--model-id", dest="model_id", help="VoxCPM model id")
    parser.add_argument("--default-voice", dest="default_voice", help="Default voice preset id")
    parser.add_argument("--cfg-value", dest="default_cfg_value", type=float, help="Default cfg_value")
    parser.add_argument(
        "--inference-timesteps",
        dest="default_inference_timesteps",
        type=int,
        help="Default inference timesteps",
    )
    parser.add_argument("--max-workers", dest="max_workers", type=int, help="Worker thread count")
    parser.add_argument("--sample-rate", dest="sample_rate", type=int, help="Output sample rate")
    parser.add_argument("--voice-presets-json", dest="voice_presets_json", help="Voice preset JSON string")
    parser.add_argument(
        "--load-denoiser",
        dest="load_denoiser",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="Enable or disable VoxCPM denoiser",
    )
    parser.add_argument(
        "--preload-model",
        dest="preload_model",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="Enable or disable model preload on startup",
    )
    parser.add_argument(
        "--enable-mock",
        dest="enable_mock",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="Enable or disable mock inference mode",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    overrides = {key: value for key, value in vars(args).items() if value is not None}
    config = load_config(overrides=overrides)
    run_server(config=config)


if __name__ == "__main__":
    main()
