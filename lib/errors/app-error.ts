/**
 * Shared application error layer for consistent HTTP mapping.
 */

export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'INTERNAL'

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly status: number
  readonly details?: unknown

  constructor(
    message: string,
    opts?: { code?: AppErrorCode; status?: number; details?: unknown; cause?: unknown },
  ) {
    super(message)
    this.name = 'AppError'
    this.code = opts?.code ?? 'INTERNAL'
    this.status = opts?.status ?? statusForCode(this.code)
    this.details = opts?.details
    if (opts?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = opts.cause
    }
  }

  toJSON() {
    return {
      ok: false,
      error: this.message,
      code: this.code,
      ...(this.details !== undefined ? { details: this.details } : {}),
    }
  }
}

function statusForCode(code: AppErrorCode): number {
  switch (code) {
    case 'BAD_REQUEST':
      return 400
    case 'UNAUTHORIZED':
      return 401
    case 'FORBIDDEN':
      return 403
    case 'NOT_FOUND':
      return 404
    case 'CONFLICT':
      return 409
    case 'UNPROCESSABLE':
      return 422
    default:
      return 500
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}

export function toErrorResponse(err: unknown): { body: Record<string, unknown>; status: number } {
  if (isAppError(err)) {
    return { body: err.toJSON(), status: err.status }
  }
  const message = err instanceof Error ? err.message : 'Internal server error'
  return {
    body: { ok: false, error: message, code: 'INTERNAL' },
    status: 500,
  }
}
