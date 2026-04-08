const STATUS_SET = new Set(['queued', 'running', 'done', 'failed']);

function nowIso() {
  return new Date().toISOString();
}

function createJobId() {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStatus(status) {
  return STATUS_SET.has(status) ? status : 'queued';
}

export function createJobStore() {
  const jobs = new Map();

  function createJob({ request, baseUrl, responseMode }) {
    const id = createJobId();
    const createdAt = nowIso();
    const job = {
      id,
      request,
      baseUrl,
      responseMode,
      status: 'queued',
      error: null,
      result: null,
      createdAt,
      updatedAt: createdAt,
    };
    jobs.set(id, job);
    return job;
  }

  function getJob(id) {
    return jobs.get(id) || null;
  }

  function updateJob(id, patch) {
    const current = getJob(id);
    if (!current) {
      return null;
    }
    Object.assign(current, patch, {
      updatedAt: nowIso(),
    });
    if (patch.status) {
      current.status = normalizeStatus(patch.status);
    }
    return current;
  }

  function toEnvelope(job) {
    if (!job) {
      return null;
    }

    return {
      jobId: job.id,
      id: job.id,
      status: job.status,
      pollUrl: `${job.baseUrl}/jobs/${encodeURIComponent(job.id)}`,
      result: job.result || undefined,
      error: job.error || undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  return {
    createJob,
    getJob,
    updateJob,
    toEnvelope,
  };
}
