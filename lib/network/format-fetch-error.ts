export type FormattedFetchError = {
  message: string
  code?: string
  errno?: number
  syscall?: string
  hostname?: string
}

/** Expand Node/undici generic "fetch failed" into DNS/TLS/timeout details. */
export function formatFetchError(error: unknown): FormattedFetchError {
  if (!(error instanceof Error)) {
    return { message: String(error) }
  }

  const cause = (error as Error & { cause?: NodeJS.ErrnoException }).cause
  const parts: string[] = [error.message]

  if (cause?.code) parts.push(`code=${cause.code}`)
  if (cause?.hostname) parts.push(`host=${cause.hostname}`)
  if (cause?.syscall) parts.push(`syscall=${cause.syscall}`)
  if (cause?.message && cause.message !== error.message) parts.push(cause.message)

  return {
    message: parts.join(' | '),
    code: cause?.code,
    errno: cause?.errno,
    syscall: cause?.syscall,
    hostname: cause?.hostname,
  }
}
