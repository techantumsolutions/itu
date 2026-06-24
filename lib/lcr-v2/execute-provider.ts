import { executeGenericRequest, type EndpointConfig } from '@/lib/providers/generic-client'
import { executeDtoneMappedRecharge } from '@/lib/providers/dtone-recharge'
import { resolveMetadataConfig, buildApiClientConfig } from '@/lib/providers/generic-connector'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { rowToProviderConfig } from '@/lib/lcr-v2/provider-credentials'
import type { ProviderConfig } from '@/lib/providers/types'
import {
  buildProviderPayloadFromContext,
  builtInErrorMessage,
  builtInPathForStrategy,
  builtInProviderRef,
  builtInSuccessCheck,
  logProviderExecutionContext,
  type ProviderExecutionContext,
  validateProviderExecutionContext,
} from '@/lib/lcr-v2/provider-execution-context'

export type ExecuteResult = {
  ok: boolean
  providerRef?: string
  raw?: unknown
  error?: string
  errorCode?: string
  errorMessage?: string
  requestAudit?: {
    method: string
    url: string
    path?: string
    base_url?: string
    body?: Record<string, unknown>
    product_id?: number
    provider_plan_id?: string
  }
}

function getPathValue(obj: unknown, path: string): unknown {
  if (!obj || !path) return undefined
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

async function getActiveProviderConfig(adapterKey: string): Promise<ProviderConfig | null> {
  try {
    const res = await supabaseRest(
      `lcr_providers?adapter_key=eq.${encodeURIComponent(adapterKey)}&is_active=eq.true&limit=1`,
      { cache: 'no-store' },
    )
    if (!res.ok) return null
    const rows = (await res.json()) as Record<string, unknown>[]
    if (!rows?.length) return null
    return rowToProviderConfig(rows[0])
  } catch {
    return null
  }
}

/** Execute recharge using explicit provider execution context (no customer payment in payload). */
export async function executeMappedRecharge(ctx: ProviderExecutionContext): Promise<ExecuteResult> {
  const validation = validateProviderExecutionContext(ctx)
  if (!validation.valid) {
    return {
      ok: false,
      error: `EXECUTION_CONTEXT_INVALID:${validation.missing.join(',')}`,
      errorMessage: `Missing execution context fields: ${validation.missing.join(', ')}`,
    }
  }

  logProviderExecutionContext(ctx, 'payload-build')
  const built = buildProviderPayloadFromContext(ctx)
  console.log(
    '[Provider Execution]',
    `payload=${built.logLine}`,
    `recharge_wholesale=${ctx.provider_wholesale_amount} ${ctx.provider_wholesale_currency}`,
    `recharge_destination=${ctx.destination_face_value} ${ctx.destination_currency}`,
  )

  const key = ctx.adapterKey

  try {
    const config = await getActiveProviderConfig(key)
    if (!config) {
      return { ok: false, error: `PROVIDER_NOT_ACTIVE:${key}` }
    }

    if (key === 'dtone') {
      const systemPlanId =
        'systemPlanId' in ctx
          ? (ctx as { systemPlanId?: string | null }).systemPlanId
          : undefined
      return executeDtoneMappedRecharge(ctx, config, { systemPlanId })
    }

    const meta = resolveMetadataConfig(config)
    const apiConfig = buildApiClientConfig(config, meta)

    let path = built.path ?? builtInPathForStrategy(ctx)
    let method: 'POST' | 'GET' = 'POST'
    let requestBody: Record<string, unknown> = built.body

    let isSuccessFn = (res: unknown) => builtInSuccessCheck(key, res)
    let getRefFn = (res: unknown, extId: string) => builtInProviderRef(key, res, extId)
    let getErrorFn = (res: unknown) => builtInErrorMessage(key, res) || 'TRANSACTION_FAILED'

    const customConfig = (config.auth as { syncConfig?: unknown; extra?: { syncConfig?: unknown } })?.syncConfig
      ?? (config.auth as { extra?: { syncConfig?: unknown } })?.extra?.syncConfig
    const txConfig = (customConfig as { transaction?: Record<string, unknown> } | undefined)?.transaction

    if (txConfig && !['ding', 'valuetopup', 'dtone'].includes(key)) {
      path = String(txConfig.path ?? path)
      method = (txConfig.method as 'POST' | 'GET') || method
      requestBody = {}
      const mappings = txConfig.mappings as Record<string, string> | undefined
      if (mappings) {
        for (const [bodyKey, inputPath] of Object.entries(mappings)) {
          if (inputPath === 'externalId') requestBody[bodyKey] = ctx.externalId
          else if (inputPath === 'providerPlanId') requestBody[bodyKey] = ctx.providerPlanId
          else if (inputPath === 'phoneDigits') requestBody[bodyKey] = ctx.phoneDigits
          else if (inputPath === 'providerWholesaleAmount')
            requestBody[bodyKey] = ctx.provider_wholesale_amount
          else if (inputPath === 'destinationFaceValue')
            requestBody[bodyKey] = ctx.destination_face_value
          else if (inputPath === 'sendAmount') requestBody[bodyKey] = ctx.provider_wholesale_amount
        }
      }
      if (txConfig.response) {
        const response = txConfig.response as Record<string, unknown>
        if (response.successField) {
          const successField = String(response.successField)
          const successValues = (response.successValues as unknown[]) || ['success', 'successful', 'ok', true, 200, 1]
          isSuccessFn = (res) => {
            const val = getPathValue(res, successField)
            return successValues.includes(val) || successValues.includes(String(val))
          }
        }
        if (response.refField) {
          const refField = String(response.refField)
          getRefFn = (res, extId) => String(getPathValue(res, refField) ?? extId)
        }
        if (response.errorField) {
          const errorField = String(response.errorField)
          getErrorFn = (res) => String(getPathValue(res, errorField) ?? 'TRANSACTION_FAILED')
        }
      }
    }

    const endpoint: EndpointConfig = { path, method }
    const rawResponse = await executeGenericRequest(apiConfig, endpoint, undefined, requestBody)

    if (!isSuccessFn(rawResponse)) {
      const errMsg = getErrorFn(rawResponse) || 'TRANSACTION_FAILED'
      let errCode = 'TRANSACTION_FAILED'
      if (key === 'ding' && Array.isArray((rawResponse as { ErrorCodes?: unknown[] })?.ErrorCodes)) {
        const codes = (rawResponse as { ErrorCodes: Array<{ Code?: string }> }).ErrorCodes
        errCode = String(codes[0]?.Code || errCode)
      } else if (key === 'valuetopup' && (rawResponse as { responseCode?: string })?.responseCode) {
        errCode = String((rawResponse as { responseCode: string }).responseCode)
      }
      return { ok: false, error: errMsg, errorCode: errCode, errorMessage: errMsg, raw: rawResponse }
    }

    const ref = getRefFn(rawResponse, ctx.externalId)
    return { ok: true, providerRef: ref, raw: rawResponse }
  } catch (error: unknown) {
    let errorCode = 'TRANSACTION_ERROR'
    let errorMessage = error instanceof Error ? error.message : 'Unknown transaction error'
    const errStr = String(error instanceof Error ? error.message : error)
    if (errStr.includes('HTTP ') && errStr.includes('{')) {
      try {
        const jsonStartIndex = errStr.indexOf('{')
        const jsonStr = errStr.slice(jsonStartIndex)
        const jsonErr = JSON.parse(jsonStr) as {
          errors?: Array<{ code?: string; message?: string }>
          message?: string
          error?: string
          code?: string
        }
        if (Array.isArray(jsonErr.errors) && jsonErr.errors[0]) {
          errorCode = String(jsonErr.errors[0].code || errorCode)
          errorMessage = String(jsonErr.errors[0].message || errorMessage)
        } else if (jsonErr.message || jsonErr.error) {
          errorMessage = jsonErr.message || jsonErr.error || errorMessage
          if (jsonErr.code) errorCode = String(jsonErr.code)
        }
      } catch {
        // ignore parse errors
      }
    }
    return { ok: false, error: errorMessage, errorCode, errorMessage }
  }
}
