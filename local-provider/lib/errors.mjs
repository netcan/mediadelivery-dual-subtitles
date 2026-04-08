export class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'APP_ERROR';
    this.statusCode = Number.isInteger(options.statusCode) ? options.statusCode : 500;
    this.details = options.details || null;
  }
}

export class ValidationError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'VALIDATION_ERROR',
      statusCode: options.statusCode || 400,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'NOT_FOUND',
      statusCode: options.statusCode || 404,
    });
  }
}

export class ModelUnavailableError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'MODEL_UNAVAILABLE',
      statusCode: options.statusCode || 503,
    });
  }
}

export class ModelInvokeError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'MODEL_INVOKE_ERROR',
      statusCode: options.statusCode || 502,
    });
  }
}

export class PreprocessError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || 'PREPROCESS_ERROR',
      statusCode: options.statusCode || 422,
    });
  }
}

export function toErrorEnvelope(error) {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details || undefined,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : String(error),
  };
}
