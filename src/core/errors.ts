/** Errors that cross the API boundary. `code` maps to an HTTP status; `message` is safe to show users. */
export type ErrorCode = 'INVALID' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'RATE_LIMITED' | 'INTERNAL' | 'NETWORK'

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export const STATUS: Record<ErrorCode, number> = { INVALID: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429, INTERNAL: 500, NETWORK: 503 }

export const invalid = (m: string) => new AppError('INVALID', m)
export const forbidden = (m = 'You are not allowed to do that.') => new AppError('FORBIDDEN', m)
export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found.`)
export const conflict = (m: string) => new AppError('CONFLICT', m)
