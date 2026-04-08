class AppError(Exception):
    def __init__(self, message, code="APP_ERROR", status_code=500, details=None):
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.details = details


class ValidationError(AppError):
    def __init__(self, message, code="VALIDATION_ERROR", status_code=400, details=None):
        super().__init__(message, code=code, status_code=status_code, details=details)


class NotFoundError(AppError):
    def __init__(self, message, code="NOT_FOUND", status_code=404, details=None):
        super().__init__(message, code=code, status_code=status_code, details=details)


class ModelUnavailableError(AppError):
    def __init__(self, message, code="MODEL_UNAVAILABLE", status_code=503, details=None):
        super().__init__(message, code=code, status_code=status_code, details=details)


class ModelInvokeError(AppError):
    def __init__(self, message, code="MODEL_INVOKE_ERROR", status_code=502, details=None):
        super().__init__(message, code=code, status_code=status_code, details=details)


class PreprocessError(AppError):
    def __init__(self, message, code="PREPROCESS_ERROR", status_code=422, details=None):
        super().__init__(message, code=code, status_code=status_code, details=details)


def to_error_envelope(error):
    if isinstance(error, AppError):
        payload = {
            "code": error.code,
            "message": str(error),
        }
        if error.details is not None:
            payload["details"] = error.details
        return payload

    return {
        "code": "INTERNAL_ERROR",
        "message": str(error),
    }
