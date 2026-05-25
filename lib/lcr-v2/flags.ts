import { runtimeEnv } from '@/lib/env/runtime'

/** When true, `/api/recharge` uses LCR v2 (UTI internal plans + provider adapters + idempotency). */
export function isLcrV2Enabled(): boolean {
  return runtimeEnv('LCR_V2_ENABLED') === '1' || runtimeEnv('LCR_V2_ENABLED')?.toLowerCase() === 'true'
}
