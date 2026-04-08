from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .adapters import VoxCpmAdapter
from .config import load_config
from .errors import AppError, NotFoundError, ValidationError, to_error_envelope
from .job_store import JobStore
from .service import process_job


def _normalize_source(data):
    return data.get("data") if isinstance(data, dict) and isinstance(data.get("data"), dict) else data


def _read_json_body(handler: BaseHTTPRequestHandler) -> dict:
    content_length = int(handler.headers.get("Content-Length", "0") or 0)
    if content_length <= 0:
        raise ValidationError("请求体不能为空。")
    raw_body = handler.rfile.read(content_length)
    try:
        return json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise ValidationError("请求体不是合法 JSON。") from error


def _build_cors_headers(extra_headers=None):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    }
    if extra_headers:
        headers.update(extra_headers)
    return headers


def _send_json(handler: BaseHTTPRequestHandler, status_code: int, payload: dict):
    body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(status_code)
    for key, value in _build_cors_headers({"Content-Type": "application/json; charset=utf-8", "Content-Length": str(len(body))}).items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def _send_error(handler: BaseHTTPRequestHandler, error):
    status_code = error.status_code if isinstance(error, AppError) else HTTPStatus.INTERNAL_SERVER_ERROR
    _send_json(
        handler,
        int(status_code),
        {
            "status": "failed",
            "error": to_error_envelope(error),
        },
    )


def _parse_range(range_header: str | None, file_size: int):
    if not range_header:
        return None
    if not range_header.startswith("bytes="):
        raise ValidationError("Range 请求格式无效。", status_code=416)
    byte_range = range_header[len("bytes=") :]
    start_text, _, end_text = byte_range.partition("-")
    start = int(start_text) if start_text else 0
    end = int(end_text) if end_text else file_size - 1
    if start < 0 or end < start or end >= file_size:
        raise ValidationError("Range 超出文件范围。", status_code=416)
    return start, end


def _resolve_base_url(handler: BaseHTTPRequestHandler, config) -> str:
    if config.base_url:
        return config.base_url
    host = handler.headers.get("Host", f"{config.host}:{config.port}")
    return f"http://{host}".rstrip("/")


def _resolve_response_mode(query, config) -> str:
    requested = (query.get("mode") or [config.response_mode])[0]
    return "sync" if requested == "sync" else "async"


def _validate_job_payload(body: dict):
    payload = _normalize_source(body or {})
    if not isinstance(payload, dict):
        raise ValidationError("请求体必须是对象。")
    subtitles = payload.get("subtitles")
    if not isinstance(subtitles, dict):
        raise ValidationError("缺少 subtitles 对象。")
    cues = subtitles.get("cues")
    if not isinstance(cues, list) or not cues:
        raise ValidationError("subtitles.cues 不能为空。")
    return payload


def _serve_file(handler: BaseHTTPRequestHandler, output_dir: Path, file_name: str):
    root_path = output_dir.resolve()
    file_path = (root_path / file_name).resolve()
    if root_path not in file_path.parents and file_path != root_path:
        raise ValidationError("文件路径非法。", status_code=403)
    if not file_path.is_file():
        raise NotFoundError(f"文件不存在：{file_name}")

    file_size = file_path.stat().st_size
    byte_range = _parse_range(handler.headers.get("Range"), file_size)
    if byte_range is None:
        data = file_path.read_bytes()
        handler.send_response(200)
        headers = _build_cors_headers(
            {
                "Content-Type": "audio/wav" if file_path.suffix == ".wav" else "text/vtt; charset=utf-8",
                "Content-Length": str(len(data)),
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-store",
            }
        )
        for key, value in headers.items():
            handler.send_header(key, value)
        handler.end_headers()
        handler.wfile.write(data)
        return

    start, end = byte_range
    with file_path.open("rb") as file_handle:
        file_handle.seek(start)
        data = file_handle.read(end - start + 1)

    handler.send_response(206)
    headers = _build_cors_headers(
        {
            "Content-Type": "audio/wav" if file_path.suffix == ".wav" else "text/vtt; charset=utf-8",
            "Content-Length": str(len(data)),
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
        }
    )
    for key, value in headers.items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(data)


def create_server(config=None):
    config = config or load_config()
    store = JobStore()
    adapter = VoxCpmAdapter(config)
    executor = ThreadPoolExecutor(max_workers=config.max_workers)

    def submit_async_job(job_id: str):
        job = store.get_job(job_id)
        if job is None:
            return
        try:
            process_job(job, config, store, adapter)
        except Exception as error:
            print(f"[python-provider] job {job_id} failed: {error}")

    class Handler(BaseHTTPRequestHandler):
        server_version = "PythonProvider/0.1"

        def log_message(self, format, *args):
            return

        def do_OPTIONS(self):
            self.send_response(204)
            for key, value in _build_cors_headers().items():
                self.send_header(key, value)
            self.end_headers()

        def do_GET(self):
            try:
                parsed = urlparse(self.path)
                query = parse_qs(parsed.query)
                if parsed.path == "/health":
                    _send_json(
                        self,
                        200,
                        {
                            "ok": True,
                            "provider": "voxcpm",
                            "responseMode": config.response_mode,
                            "defaultVoice": config.default_voice,
                            "voiceCount": len(config.voice_presets),
                            "ready": adapter.is_ready(),
                            "modelId": config.model_id,
                        },
                    )
                    return

                if parsed.path == "/capabilities":
                    _send_json(self, 200, adapter.get_capabilities())
                    return

                if parsed.path.startswith("/jobs/"):
                    job_id = parsed.path[len("/jobs/") :]
                    job = store.get_job(job_id)
                    if job is None:
                        raise NotFoundError(f"任务不存在：{job_id}")
                    _send_json(self, 200, store.to_envelope(job))
                    return

                if parsed.path.startswith("/files/"):
                    file_name = parsed.path[len("/files/") :]
                    _serve_file(self, config.output_dir, file_name)
                    return

                raise NotFoundError(f"未找到路由：GET {parsed.path}")
            except Exception as error:
                _send_error(self, error)

        def do_POST(self):
            try:
                parsed = urlparse(self.path)
                query = parse_qs(parsed.query)
                if parsed.path != "/jobs":
                    raise NotFoundError(f"未找到路由：POST {parsed.path}")

                payload = _validate_job_payload(_read_json_body(self))
                base_url = _resolve_base_url(self, config)
                response_mode = _resolve_response_mode(query, config)
                job = store.create_job(payload, base_url=base_url, response_mode=response_mode)

                if response_mode == "sync":
                    try:
                        process_job(job, config, store, adapter)
                    except Exception:
                        _send_json(self, 200, store.to_envelope(store.get_job(job.job_id)))
                        return
                    _send_json(self, 200, store.to_envelope(store.get_job(job.job_id)))
                    return

                _send_json(self, 202, store.to_envelope(job))
                executor.submit(submit_async_job, job.job_id)
            except Exception as error:
                _send_error(self, error)

    httpd = ThreadingHTTPServer((config.host, config.port), Handler)
    return httpd, config


def run_server(config=None):
    httpd, config = create_server(config=config)
    print(
        f"[python-provider] listening on http://{config.host}:{config.port} using VoxCPM provider -> {config.model_id}"
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
