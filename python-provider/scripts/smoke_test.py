from __future__ import annotations

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


def main():
    port = os.environ.get("PYTHON_PROVIDER_PORT", "18080")
    base_url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env["PYTHON_PROVIDER_PORT"] = port
    env["VOXCPM_ENABLE_MOCK"] = env.get("VOXCPM_ENABLE_MOCK", "1")
    env["PYTHON_PROVIDER_RESPONSE_MODE"] = env.get("PYTHON_PROVIDER_RESPONSE_MODE", "async")
    process = subprocess.Popen([sys.executable, str(ROOT / "server.py")], cwd=str(ROOT), env=env)

    try:
        wait_for_health(base_url)
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

        range_request = Request(final_payload["result"]["audioUrl"], method="GET")
        range_request.add_header("Range", "bytes=0-31")
        with urlopen(range_request) as response:
            if response.status != 206:
                raise RuntimeError(f"range request failed: {response.status}")

        subtitle_status, subtitle_text = request_text(final_payload["result"]["subtitleUrl"])
        if subtitle_status != 200 or "WEBVTT" not in subtitle_text:
            raise RuntimeError("subtitle output missing")

        print(
            json.dumps(
                {
                    "ok": True,
                    "jobId": final_payload.get("jobId"),
                    "audioUrl": final_payload["result"]["audioUrl"],
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


if __name__ == "__main__":
    main()
