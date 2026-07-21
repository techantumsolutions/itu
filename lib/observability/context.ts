/**
 * Request / job correlation context.
 * Default store is in-memory (Edge/browser-safe). Node installs AsyncLocalStorage via
 * `installNodeObsContext()` from instrumentation — keeps `node:async_hooks` off client graphs.
 */
import {
  newRequestId,
  resolveRequestId,
  REQUEST_ID_HEADER,
} from '@/lib/observability/request-id'

export { newRequestId, resolveRequestId, REQUEST_ID_HEADER }

export type ObsContext = {
  requestId: string
  userId?: string
  route?: string
  service: string
  jobName?: string
  jobId?: string
}

type ObsStore = {
  getStore(): ObsContext | undefined
  run<T>(ctx: ObsContext, fn: () => T): T
}

function createMemoryStore(): ObsStore {
  let current: ObsContext | undefined
  return {
    getStore: () => current,
    run: <T,>(ctx: ObsContext, fn: () => T): T => {
      const prev = current
      current = ctx
      try {
        return fn()
      } finally {
        current = prev
      }
    },
  }
}

let store: ObsStore = createMemoryStore()

/** Install Node AsyncLocalStorage-backed store (call once from instrumentation). */
export function installNodeObsContext(alsStore: ObsStore): void {
  store = alsStore
}

export function getObsContext(): ObsContext | undefined {
  return store.getStore()
}

export function getRequestId(): string | undefined {
  return store.getStore()?.requestId
}

export function runWithObsContext<T>(ctx: ObsContext, fn: () => T): T {
  return store.run(ctx, fn)
}

export async function runWithObsContextAsync<T>(ctx: ObsContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn)
}

export function updateObsContext(patch: Partial<ObsContext>): void {
  const cur = store.getStore()
  if (!cur) return
  Object.assign(cur, patch)
}

export function defaultServiceName(): string {
  return (
    process.env.OTEL_SERVICE_NAME?.trim() ||
    process.env.SERVICE_NAME?.trim() ||
    'itu-web'
  )
}
