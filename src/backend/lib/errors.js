// Typed domain errors mapped to HTTP status + the uniform error body by the centralized
// error handler (ADR-0008: `{ error: { code, message } }`). Handlers/services throw these;
// they never set a status code or shape a response body themselves.

export class ValidationError extends Error {
  constructor(message = 'validation failed', fields = []) {
    super(message);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

export class NotFoundError extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class UnauthenticatedError extends Error {
  constructor(message = 'authentication required') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

export class RetryExhaustedError extends Error {
  constructor(message = 'retry budget exhausted') {
    super(message);
    this.name = 'RetryExhaustedError';
  }
}
