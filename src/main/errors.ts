import type { AppError, ErrorCode } from '@shared/contract'

export class AppException extends Error {
  readonly code: ErrorCode
  readonly details?: Record<string, unknown>
  readonly retryable?: boolean

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>, retryable = false) {
    super(message)
    this.name = 'AppException'
    this.code = code
    this.details = details
    this.retryable = retryable
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppException) {
    return { code: error.code, message: error.message, details: error.details, retryable: error.retryable }
  }
  const err = error as NodeJS.ErrnoException | undefined
  if (err && (err.code === 'ENOENT' || err.code === 'EACCES' || err.code === 'EPERM')) {
    return { code: 'IO', message: '文件读写失败，请检查数据目录权限。', details: { code: err.code }, retryable: false }
  }
  return {
    code: 'INTERNAL',
    message: '发生了未预期的问题，请查看日志。',
    details: { message: err?.message ?? String(error) },
    retryable: false
  }
}
