/**
 * Node-only: bind AsyncLocalStorage into the shared obs context module.
 * Imported only from instrumentation (NEXT_RUNTIME === 'nodejs').
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { installNodeObsContext, type ObsContext } from '@/lib/observability/context'

const storage = new AsyncLocalStorage<ObsContext>()

installNodeObsContext({
  getStore: () => storage.getStore(),
  run: <T,>(ctx: ObsContext, fn: () => T) => storage.run(ctx, fn),
})
