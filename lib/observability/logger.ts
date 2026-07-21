/**
 * Structured JSON logger for production.
 * Dev keeps human-readable console output unless LOG_FORMAT=json.
 */
import { getObsContext } from '@/lib/observability/context'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFields = Record<string, unknown>

function envName(): string {
  return process.env.APP_ENV?.trim() || process.env.NODE_ENV || 'development'
}

function shouldUseJsonLogs(): boolean {
  const fmt = (process.env.LOG_FORMAT ?? '').trim().toLowerCase()
  if (fmt === 'json') return true
  if (fmt === 'pretty') return false
  return process.env.NODE_ENV === 'production'
}

/** Strip CR/LF so log lines cannot be forged (CodeQL js/log-injection). */
function sanitizeLogText(value: string): string {
  return value.replace(/[\r\n\u2028\u2029]/g, ' ')
}

function baseFields(level: LogLevel, message: string, fields?: LogFields) {
  const ctx = getObsContext()
  return {
    timestamp: new Date().toISOString(),
    level,
    message: sanitizeLogText(message),
    service: ctx?.service ?? process.env.OTEL_SERVICE_NAME ?? process.env.SERVICE_NAME ?? 'itu',
    environment: envName(),
    requestId: ctx?.requestId ? sanitizeLogText(String(ctx.requestId)) : undefined,
    userId: ctx?.userId,
    route: ctx?.route ? sanitizeLogText(String(ctx.route)) : undefined,
    jobName: ctx?.jobName ? sanitizeLogText(String(ctx.jobName)) : undefined,
    jobId: ctx?.jobId ? sanitizeLogText(String(ctx.jobId)) : undefined,
    version: process.env.APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || process.env.DEPLOY_SHA,
    ...fields,
  }
}

function write(level: LogLevel, message: string, fields?: LogFields) {
  const payload = baseFields(level, message, fields)
  if (shouldUseJsonLogs()) {
    const line = JSON.stringify(payload)
    // Single-arg console calls: no util.format format-string sink.
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
    return
  }
  const requestPart = payload.requestId ? `(${payload.requestId}) ` : ''
  const prefix = `[${payload.level}] ${requestPart}${payload.message}`
  // Constant format string — never interpolate untrusted text into arg0 (js/tainted-format-string).
  if (level === 'error') console.error('%s %j', prefix, fields ?? {})
  else if (level === 'warn') console.warn('%s %j', prefix, fields ?? {})
  else console.log('%s %j', prefix, fields ?? {})
}

export const logger = {
  debug(message: string, fields?: LogFields) {
    if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV !== 'production') {
      write('debug', message, fields)
    }
  },
  info(message: string, fields?: LogFields) {
    write('info', message, fields)
  },
  warn(message: string, fields?: LogFields) {
    write('warn', message, fields)
  },
  error(message: string, fields?: LogFields) {
    const err = fields?.err ?? fields?.error
    const stack =
      err instanceof Error
        ? err.stack
        : typeof fields?.stack === 'string'
          ? fields.stack
          : undefined
    write('error', message, {
      ...fields,
      stack,
      errorMessage: err instanceof Error ? err.message : fields?.errorMessage,
    })
  },
}

/** Bridge ad-hoc console.* to structured logs in production (does not change return values). */
export function installConsoleBridge(): void {
  if (process.env.LOG_CONSOLE_BRIDGE === '0') return
  if (process.env.NODE_ENV !== 'production' && process.env.LOG_CONSOLE_BRIDGE !== '1') return
  if ((globalThis as { __ituConsoleBridge?: boolean }).__ituConsoleBridge) return
  ;(globalThis as { __ituConsoleBridge?: boolean }).__ituConsoleBridge = true

  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  }

  const toMsg = (args: unknown[]) =>
    args
      .map((a) => {
        if (typeof a === 'string') return a
        if (a instanceof Error) return a.message
        try {
          return JSON.stringify(a)
        } catch {
          return String(a)
        }
      })
      .join(' ')

  console.log = (...args: unknown[]) => logger.info(toMsg(args))
  console.info = (...args: unknown[]) => logger.info(toMsg(args))
  console.warn = (...args: unknown[]) => logger.warn(toMsg(args))
  console.error = (...args: unknown[]) => {
    const err = args.find((a) => a instanceof Error)
    logger.error(toMsg(args), err instanceof Error ? { err } : undefined)
  }
  console.debug = (...args: unknown[]) => logger.debug(toMsg(args))

  // Keep originals available for emergency debugging
  ;(console as unknown as { __orig?: typeof orig }).__orig = orig
}
