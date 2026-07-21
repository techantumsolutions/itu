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

  if (cause && typeof cause === 'object') {
    const c = cause as NodeJS.ErrnoException & { hostname?: string }
    if (c.code) parts.push(`code=${c.code}`)
    if (c.hostname) parts.push(`host=${c.hostname}`)
    if (c.syscall) parts.push(`syscall=${c.syscall}`)
    if (c.message && c.message !== error.message) parts.push(c.message)

    return {
      message: parts.join(' | '),
      code: c.code,
      errno: typeof c.errno === 'number' ? c.errno : undefined,
      syscall: c.syscall,
      hostname: c.hostname,
    }
  }

  return { message: parts.join(' | ') }
}
