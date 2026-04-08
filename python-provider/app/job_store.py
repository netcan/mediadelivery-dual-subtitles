from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
import random
import time


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _create_job_id() -> str:
    return f"job_{int(time.time() * 1000):x}_{random.randint(0, 0xFFFFFF):06x}"


@dataclass
class Job:
    job_id: str
    request: dict
    base_url: str
    response_mode: str
    status: str = "queued"
    error: dict | None = None
    result: dict | None = None
    created_at: str = field(default_factory=_now_iso)
    updated_at: str = field(default_factory=_now_iso)


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = Lock()

    def create_job(self, request: dict, base_url: str, response_mode: str) -> Job:
        with self._lock:
            job = Job(
                job_id=_create_job_id(),
                request=request,
                base_url=base_url,
                response_mode=response_mode,
            )
            self._jobs[job.job_id] = job
            return job

    def get_job(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def update_job(self, job_id: str, **patch) -> Job | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            for key, value in patch.items():
                setattr(job, key, value)
            job.updated_at = _now_iso()
            return job

    def to_envelope(self, job: Job | None) -> dict | None:
        if not job:
            return None
        payload = {
            "jobId": job.job_id,
            "id": job.job_id,
            "status": job.status,
            "pollUrl": f"{job.base_url}/jobs/{job.job_id}",
            "createdAt": job.created_at,
            "updatedAt": job.updated_at,
        }
        if job.result is not None:
            payload["result"] = deepcopy(job.result)
        if job.error is not None:
            payload["error"] = deepcopy(job.error)
        return payload
