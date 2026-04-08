from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]


def request_json(url: str, method: str = "GET", payload: dict | None = None, headers: dict | None = None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(url, data=data, method=method)
    request.add_header("Accept", "application/json")
    if payload is not None:
        request.add_header("Content-Type", "application/json")
    if headers:
        for key, value in headers.items():
            request.add_header(key, value)
    with urlopen(request) as response:
        return response.status, json.loads(response.read().decode("utf-8"))


def request_text(url: str, headers: dict | None = None):
    request = Request(url, method="GET")
    if headers:
        for key, value in headers.items():
            request.add_header(key, value)
    with urlopen(request) as response:
        return response.status, response.read().decode("utf-8", errors="ignore")


def wait_for_health(base_url: str, timeout_sec: float = 10.0):
    deadline = time.time() + timeout_sec
    last_error = None
    while time.time() < deadline:
        try:
            status, payload = request_json(f"{base_url}/health")
            if status == 200 and payload.get("ok"):
                return payload
        except Exception as error:
            last_error = error
        time.sleep(0.2)
    raise RuntimeError(f"health check failed: {last_error}")


def run_smoke(startup_mode: str, port: str):
    base_url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env["VOXCPM_ENABLE_MOCK"] = "1"
    env["PYTHON_PROVIDER_RESPONSE_MODE"] = "async"

    if startup_mode == "cli":
        env["PYTHON_PROVIDER_PORT"] = "19999"
        env["VOXCPM_MODEL_ID"] = "env-model-should-be-overridden"
        command = [
            sys.executable,
            str(ROOT / "server.py"),
            "--host",
            "127.0.0.1",
            "--port",
            port,
            "--response-mode",
            "async",
            "--model-id",
            "cli-model",
            "--enable-mock",
        ]
        expected_model_id = "cli-model"
    else:
        env["PYTHON_PROVIDER_PORT"] = port
        env["VOXCPM_MODEL_ID"] = "env-model"
        command = [sys.executable, str(ROOT / "server.py")]
        expected_model_id = "env-model"

    process = subprocess.Popen(command, cwd=str(ROOT), env=env)

    try:
        health_payload = wait_for_health(base_url)
        if health_payload.get("modelId") != expected_model_id:
            raise RuntimeError(
                f"unexpected model id for {startup_mode}: {health_payload.get('modelId')} != {expected_model_id}"
            )
        status, capabilities = request_json(f"{base_url}/capabilities")
        if status != 200 or not capabilities.get("voices"):
            raise RuntimeError("capabilities missing voices")

        create_status, created = request_json(
            f"{base_url}/jobs",
            method="POST",
            payload={
                "sourceLanguage": "en",
                "targetLanguage": "zh",
                "timingSource": "subtitle",
                "asrEnabled": False,
                "provider": {
                    "voicePreset": capabilities["voices"][0]["id"],
                },
                "subtitles": {
                    "trackId": "zh",
                    "label": "Chinese",
                    "language": "zh",
                    "cues": [
                        {"start": 0.2, "end": 1.8, "text": "这是第一句中文字幕。"},
                        {"start": 2.1, "end": 3.8, "text": "这里是第二句，用于验证 Python provider。"},
                    ],
                },
            },
        )
        if create_status not in (200, 202):
            raise RuntimeError(f"unexpected create status: {create_status}")

        poll_url = created.get("pollUrl")
        if not poll_url:
            raise RuntimeError("missing pollUrl")

        final_payload = created
        for _ in range(30):
            time.sleep(0.2)
            _, final_payload = request_json(poll_url)
            if final_payload.get("status") == "done":
                break
            if final_payload.get("status") == "failed":
                raise RuntimeError(final_payload.get("error", {}).get("message", "job failed"))

        if final_payload.get("status") != "done" or not final_payload.get("result", {}).get("audioUrl"):
            raise RuntimeError("job did not finish successfully")

        result = final_payload["result"]
        if not isinstance(result.get("segments"), list) or not result["segments"]:
            raise RuntimeError("segment output missing")
        first_segment = result["segments"][0]
        if not first_segment.get("audioUrl"):
            raise RuntimeError("segment audio url missing")

        range_request = Request(result["audioUrl"], method="GET")
        range_request.add_header("Range", "bytes=0-31")
        with urlopen(range_request) as response:
            if response.status != 206:
                raise RuntimeError(f"range request failed: {response.status}")

        segment_status, _ = request_text(first_segment["audioUrl"])
        if segment_status != 200:
            raise RuntimeError("segment audio output missing")

        subtitle_status, subtitle_text = request_text(result["subtitleUrl"])
        if subtitle_status != 200 or "WEBVTT" not in subtitle_text:
            raise RuntimeError("subtitle output missing")

        print(
            json.dumps(
                {
                    "ok": True,
                    "startupMode": startup_mode,
                    "jobId": final_payload.get("jobId"),
                    "audioUrl": result["audioUrl"],
                    "segmentAudioUrl": first_segment["audioUrl"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def parse_args():
    parser = argparse.ArgumentParser(description="Smoke test the Python provider.")
    parser.add_argument(
        "--startup-mode",
        choices=("env", "cli", "both"),
        default="both",
        help="Choose env startup, cli startup, or validate both",
    )
    parser.add_argument("--port", default="18080", help="Base port used by the smoke test")
    return parser.parse_args()


def main():
    args = parse_args()
    base_port = int(args.port)

    if args.startup_mode in {"env", "both"}:
        run_smoke("env", str(base_port))
    if args.startup_mode in {"cli", "both"}:
        run_smoke("cli", str(base_port + 1))


if __name__ == "__main__":
    main()
