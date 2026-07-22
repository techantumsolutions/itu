/**
 * Structured JSON logger for production.
 * Dev keeps human-readable console output unless LOG_FORMAT=json.
 *
 * Critical: after installConsoleBridge(), write() MUST use unbound console
 * originals. Bridged console.log → logger.info → console.log nested each
 * JSON line inside the next until RangeError: Invalid string length.
 */
import { getObsContext } from '@/lib/observability/context'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFields = Record<string, unknown>

const MAX_FIELD_STRING = 1_000
const MAX_DEPTH = 8
const MAX_LINE_CHARS = 32_000
const MAX_ARRAY_ITEMS = 50
const MAX_OBJECT_KEYS = 40

/** Unbound originals — never replaced by the console bridge. */
const nativeConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
}

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

function truncateString(value: string, max = MAX_FIELD_STRING): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…[truncated ${value.length} chars]`
}

/**
 * Safe JSON serialization: circular refs, depth limits, string truncation.
 * Never throws RangeError from unbounded stringify.
 */
export function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>()

  function walk(node: unknown, depth: number): unknown {
    if (depth > MAX_DEPTH) return '[Max Depth Exceeded]'

    if (typeof node === 'string') return truncateString(sanitizeLogText(node))
    if (typeof node === 'bigint') return node.toString()
    if (typeof node === 'function') return `[Function ${node.name || 'anonymous'}]`
    if (typeof node === 'symbol') return node.toString()
    if (node === undefined) return undefined
    if (node === null || typeof node !== 'object') return node

    if (node instanceof Error) {
      return {
        name: node.name,
        message: truncateString(sanitizeLogText(node.message)),
        stack: node.stack ? truncateString(sanitizeLogText(node.stack), 2_000) : undefined,
      }
    }

    if (seen.has(node)) return '[Circular]'
    seen.add(node)

    if (Array.isArray(node)) {
      const items = node.slice(0, MAX_ARRAY_ITEMS).map((item) => walk(item, depth + 1))
      if (node.length > MAX_ARRAY_ITEMS) {
        items.push(`[truncated ${node.length - MAX_ARRAY_ITEMS} items]`)
      }
      return items
    }

    const out: Record<string, unknown> = {}
    let count = 0
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (count++ >= MAX_OBJECT_KEYS) {
        out['…'] = '[truncated keys]'
        break
      }
      out[k] = walk(v, depth + 1)
    }
    return out
  }

  try {
    let line = JSON.stringify(walk(value, 0))
    if (line === undefined) return 'null'
    if (line.length > MAX_LINE_CHARS) {
      line = `${line.slice(0, MAX_LINE_CHARS)}…[truncated log line]`
    }
    return line
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return JSON.stringify({
      level: 'error',
      message: 'log_serialization_failed',
      detail: truncateString(sanitizeLogText(msg), 200),
    })
  }
}

/** Reduce Error / unknown into flat, serializable fields (no raw object dump). */
function sanitizeFields(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined

  const out: LogFields = {}
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'err' || key === 'error') {
      if (value instanceof Error) {
        out.errorName = value.name
        out.errorMessage = truncateString(sanitizeLogText(value.message))
        out.stack = value.stack
          ? truncateString(sanitizeLogText(value.stack), 2_000)
          : undefined
      } else if (value != null) {
        out.errorMessage = truncateString(sanitizeLogText(String(value)))
      }
      continue
    }
    if (typeof value === 'string') {
      out[key] = truncateString(sanitizeLogText(value))
      continue
    }
    if (value instanceof Error) {
      out[key] = {
        name: value.name,
        message: truncateString(sanitizeLogText(value.message)),
      }
      continue
    }
    out[key] = value
  }
  return out
}

function baseFields(level: LogLevel, message: string, fields?: LogFields) {
  const ctx = getObsContext()
  return {
    timestamp: new Date().toISOString(),
    level,
    message: truncateString(sanitizeLogText(message), 2_000),
    service: ctx?.service ?? process.env.OTEL_SERVICE_NAME ?? process.env.SERVICE_NAME ?? 'itu',
    environment: envName(),
    requestId: ctx?.requestId ? sanitizeLogText(String(ctx.requestId)) : undefined,
    userId: ctx?.userId,
    route: ctx?.route ? sanitizeLogText(String(ctx.route)) : undefined,
    jobName: ctx?.jobName ? sanitizeLogText(String(ctx.jobName)) : undefined,
    jobId: ctx?.jobId ? sanitizeLogText(String(ctx.jobId)) : undefined,
    version: process.env.APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || process.env.DEPLOY_SHA,
    ...sanitizeFields(fields),
  }
}

function write(level: LogLevel, message: string, fields?: LogFields) {
  const payload = baseFields(level, message, fields)
  // Always use nativeConsole — bridged console.* would recurse into logger.
  if (shouldUseJsonLogs()) {
    const line = safeJsonStringify(payload)
    if (level === 'error') nativeConsole.error(line)
    else if (level === 'warn') nativeConsole.warn(line)
    else nativeConsole.log(line)
    return
  }
  const requestPart = payload.requestId ? `(${payload.requestId}) ` : ''
  const prefix = `[${payload.level}] ${requestPart}${payload.message}`
  // Constant format string — never interpolate untrusted text into arg0 (js/tainted-format-string).
  const safeFields = sanitizeFields(fields) ?? {}
  if (level === 'error') nativeConsole.error('%s %j', prefix, safeFields)
  else if (level === 'warn') nativeConsole.warn('%s %j', prefix, safeFields)
  else nativeConsole.log('%s %j', prefix, safeFields)
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
    write('error', message, fields)
  },
}

/** Bridge ad-hoc console.* to structured logs in production (does not change return values). */
export function installConsoleBridge(): void {
  if (process.env.LOG_CONSOLE_BRIDGE === '0') return
  if (process.env.NODE_ENV !== 'production' && process.env.LOG_CONSOLE_BRIDGE !== '1') return
  if ((globalThis as { __ituConsoleBridge?: boolean }).__ituConsoleBridge) return
  ;(globalThis as { __ituConsoleBridge?: boolean }).__ituConsoleBridge = true

  const toMsg = (args: unknown[]) =>
    args
      .map((a) => {
        if (typeof a === 'string') return truncateString(sanitizeLogText(a), 2_000)
        if (a instanceof Error) return truncateString(sanitizeLogText(a.message), 500)
        return truncateString(safeJsonStringify(a), 2_000)
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

  ;(console as unknown as { __orig?: typeof nativeConsole }).__orig = nativeConsole
}
