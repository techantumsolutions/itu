import { executeGenericRequest, type ApiRequestConfig, type EndpointConfig } from '@/lib/providers/generic-client'
import { resolveMetadataConfig, buildApiClientConfig } from '@/lib/providers/generic-connector'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { rowToProviderConfig } from '@/lib/lcr-v2/provider-credentials'
import type { ProviderConfig } from '@/lib/providers/types'

export type ExecuteResult = { ok: boolean; providerRef?: string; raw?: unknown; error?: string }

function getPathValue(obj: any, path: string): any {
  if (!obj || !path) return undefined
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current == null) return undefined
    current = current[part]
  }
  return current
}

async function getActiveProviderConfig(adapterKey: string): Promise<ProviderConfig | null> {
  try {
    const res = await supabaseRest(
      `lcr_providers?adapter_key=eq.${encodeURIComponent(adapterKey)}&is_active=eq.true&limit=1`,
      { cache: 'no-store' }
    )
    if (!res.ok) return null
    const rows = await res.json() as any[]
    if (!rows || rows.length === 0) return null
    return rowToProviderConfig(rows[0])
  } catch {
    return null
  }
}

interface BuiltInTxConfig {
  path: (input: any) => string
  body: (input: any) => any
  isSuccess: (res: any) => boolean
  getRef: (res: any, extId: string) => string
  getError: (res: any) => string | undefined
}

const BUILT_IN_TX: Record<string, BuiltInTxConfig> = {
  dtone: {
    path: () => '/v1/transactions',
    body: (inp) => ({
      external_id: inp.externalId,
      product_id: Number(inp.providerPlanId),
      auto_confirm: true,
      credit_party_identifier: { mobile_number: inp.phoneDigits }
    }),
    isSuccess: (res) => {
      const statusId = res?.status?.id
      return statusId !== 3 && statusId !== 9
    },
    getRef: (res, extId) => String(res?.id ?? extId),
    getError: (res) => (res?.status?.id === 3 || res?.status?.id === 9) ? 'DTONE_DECLINED' : undefined
  },
  valuetopup: {
    path: (inp) => {
      const isPin = !inp.phoneDigits
      return isPin ? '/transaction/pin' : '/transaction/topup'
    },
    body: (inp) => {
      const sep = inp.providerPlanId.indexOf(':')
      const product = sep > 0 ? inp.providerPlanId.slice(0, sep) : inp.providerPlanId
      const amountFromId = sep > 0 ? Number(inp.providerPlanId.slice(sep + 1)) : NaN
      const amount = Number.isFinite(amountFromId) && amountFromId > 0
        ? amountFromId
        : typeof inp.sendAmount === 'number' && inp.sendAmount > 0
          ? inp.sendAmount
          : 0
      const isPin = !inp.phoneDigits
      return isPin
        ? {
            SkuId: Number(product),
            CorrelationId: inp.externalId.slice(0, 50)
          }
        : {
            SkuId: Number(product),
            Amount: amount,
            Mobile: inp.phoneDigits,
            CorrelationId: inp.externalId.slice(0, 50)
          }
    },
    isSuccess: (res) => {
      const status = String(res?.status || '').trim().toLowerCase()
      return status === 'succesful' || status === 'successful' || status === 'accepted' || status === 'processing' || res?.responseCode === '000'
    },
    getRef: (res, extId) => String(res?.payLoad?.transactionId ?? res?.payLoad?.refid ?? res?.refid ?? extId),
    getError: (res) => {
      const status = String(res?.status || '').trim().toLowerCase()
      if (status === 'failed' || res?.responseCode !== '000') {
        return String(res?.remarks || res?.responseMessage || 'VALUETOPUP_FAILED')
      }
      return undefined
    }
  },
  ding: {
    path: () => '/api/V1/SendTransfer',
    body: (inp) => ({
      SkuCode: inp.providerPlanId,
      SendValue: typeof inp.sendAmount === 'number' && inp.sendAmount > 0 ? inp.sendAmount : 0,
      AccountNumber: inp.phoneDigits,
      DistributorRef: inp.externalId,
      ValidateOnly: false
    }),
    isSuccess: (res) => res?.ResultCode === 1,
    getRef: (res, extId) => String(res?.TransferRecord?.TransferId?.TransferRef ?? extId),
    getError: (res) => res?.ResultCode !== 1 ? (res?.ErrorCodes?.[0]?.Code || 'DING_FAILED') : undefined
  }
}

/** Execute recharge on the mapped provider dynamically. */
export async function executeMappedRecharge(input: {
  adapterKey: string
  providerPlanId: string
  phoneDigits: string
  externalId: string
  sendAmount?: number
}): Promise<ExecuteResult> {
  const key = (input.adapterKey || '').toLowerCase()

  try {
    // 1. Fetch active provider configuration dynamically from the database
    const config = await getActiveProviderConfig(key)
    if (!config) {
      return { ok: false, error: `PROVIDER_NOT_ACTIVE:${key}` }
    }

    const meta = resolveMetadataConfig(config)
    const apiConfig = buildApiClientConfig(config, meta)

    // 2. Identify transaction endpoint path and body
    let path = '/v1/recharge'
    let method: 'POST' | 'GET' = 'POST'
    let requestBody: any = null
    
    let isSuccessFn = (res: any) => {
      const val = getPathValue(res, 'status')
      return ['success', 'successful', 'ok', true, 200, 1].includes(val) || ['success', 'successful', 'ok', 'true', '200', '1'].includes(String(val))
    }
    let getRefFn = (res: any, extId: string) => String(getPathValue(res, 'transaction_id') || getPathValue(res, 'id') || extId)
    let getErrorFn = (res: any) => res?.message || res?.error || 'TRANSACTION_FAILED'

    const builtIn = BUILT_IN_TX[key]
    if (builtIn) {
      path = builtIn.path(input)
      requestBody = builtIn.body(input)
      isSuccessFn = builtIn.isSuccess
      getRefFn = builtIn.getRef
      getErrorFn = (res) => builtIn.getError(res) || 'TRANSACTION_FAILED'
    } else {
      // Dynamic config from DB metadata for custom/new providers
      const customConfig = (config.auth as any)?.syncConfig || (config.auth?.extra as any)?.syncConfig
      const txConfig = customConfig?.transaction
      
      if (txConfig) {
        path = txConfig.path || path
        method = txConfig.method || method
        requestBody = {}
        if (txConfig.mappings) {
          for (const [bodyKey, inputPath] of Object.entries(txConfig.mappings)) {
            if (inputPath === 'externalId') requestBody[bodyKey] = input.externalId
            else if (inputPath === 'providerPlanId') requestBody[bodyKey] = input.providerPlanId
            else if (inputPath === 'phoneDigits') requestBody[bodyKey] = input.phoneDigits
            else if (inputPath === 'sendAmount') requestBody[bodyKey] = input.sendAmount
          }
        }
        
        if (txConfig.response?.successField) {
          const successField = txConfig.response.successField
          const successValues = txConfig.response.successValues || ['success', 'successful', 'ok', true, 200, 1]
          isSuccessFn = (res) => {
            const val = getPathValue(res, successField)
            return successValues.includes(val) || successValues.includes(String(val))
          }
        }
        
        if (txConfig.response?.refField) {
          const refField = txConfig.response.refField
          getRefFn = (res, extId) => String(getPathValue(res, refField) || extId)
        }

        if (txConfig.response?.errorField) {
          const errorField = txConfig.response.errorField
          getErrorFn = (res) => getPathValue(res, errorField) || 'TRANSACTION_FAILED'
        }
      } else {
        // Fallback default mapping
        requestBody = {
          external_id: input.externalId,
          product_id: input.providerPlanId,
          recipient_phone: input.phoneDigits,
          amount: input.sendAmount
        }
      }
    }

    const endpoint: EndpointConfig = {
      path,
      method
    }

    // 3. Execute request dynamically
    const rawResponse = await executeGenericRequest(apiConfig, endpoint, undefined, requestBody)

    // 4. Evaluate success and response mapping
    if (!isSuccessFn(rawResponse)) {
      return { ok: false, error: getErrorFn(rawResponse), raw: rawResponse }
    }

    const ref = getRefFn(rawResponse, input.externalId)
    return { ok: true, providerRef: ref, raw: rawResponse }
  } catch (error: any) {
    return { ok: false, error: error.message || 'TRANSACTION_ERROR' }
  }
}
