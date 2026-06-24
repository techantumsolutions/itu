import {
  DEFAULT_DTONE_BASE_URL,
  DTONE_TRANSACTION_API_DOCS,
  resolveDtoneTransactionPath,
  assertDtoneProductIdSource,
  extractDtoneRequiredCreditPartyFields,
  parseDtoneApiErrorBody,
  resolveDtoneCatalogBaseUrl,
  validateDtoneCreditPartyPayload,
} from '@/lib/dtone'
import {
  builtInErrorMessage,
  builtInProviderRef,
  builtInSuccessCheck,
  type ProviderExecutionContext,
} from '@/lib/lcr-v2/provider-execution-context'
import { buildDtonePayload, loadProviderRawPlan } from '@/lib/lcr-v2/provider-recharge-validation'
import { formatFetchError } from '@/lib/network/format-fetch-error'
import type { ProviderConfig } from '@/lib/providers/types'

export {
  assertDtoneProductIdSource,
  extractDtoneRequiredCreditPartyFields,
  validateDtoneCreditPartyPayload,
} from '@/lib/dtone'

function normalizeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host.toLowerCase()
  } catch {
    return baseUrl.trim().toLowerCase()
  }
}

export function logDtoneEnvironmentParity(input: {
  catalogBaseUrl: string
  rechargeBaseUrl: string
  apiDocs: string
}): void {
  const catalogHost = normalizeHost(input.catalogBaseUrl)
  const rechargeHost = normalizeHost(input.rechargeBaseUrl)
  const hostsMatch = catalogHost === rechargeHost
  const transactionPath = resolveDtoneTransactionPath(input.rechargeBaseUrl)
  console.log('[DT One Recharge] environment_check', {
    catalog_base_url: input.catalogBaseUrl,
    recharge_base_url: input.rechargeBaseUrl,
    hosts_match: hostsMatch,
    transaction_path: transactionPath,
    api_host_type: transactionPath.includes('/sync/')
      ? 'dvs-api (preprod-dvs-api / dvs-api)'
      : 'legacy (prepaid.dtone.com)',
    api_docs: input.apiDocs,
    note: hostsMatch
      ? `Catalog (GET /v1/products) and recharge (POST ${transactionPath}) share the same host`
      : 'MISMATCH — product catalog and recharge may target different DT One environments',
  })
  if (!hostsMatch) {
    console.warn(
      '[DT One Recharge] ENVIRONMENT_MISMATCH: catalog base URL differs from recharge base URL; error 1000404 may indicate wrong environment rather than stale mapping',
    )
  }
}

function redactAuthHeader(headers: Record<string, string>): Record<string, string> {
  const safe = { ...headers }
  if (safe.Authorization) safe.Authorization = '[REDACTED]'
  return safe
}

function logDtoneProductNotFound(input: {
  productId: number
  endpointUrl: string
  providerPlanId: string
  responseStatus: number
  responseBody: unknown
}): void {
  console.error('[DT One Recharge] error_1000404_product_not_found', {
    product_id: input.productId,
    provider_plan_id: input.providerPlanId,
    endpoint: input.endpointUrl,
    response_status: input.responseStatus,
    response_body: input.responseBody,
    hint: 'Verify product exists on this base URL (sandbox vs production) and payload matches required_credit_party_identifier_fields',
  })
}

export type DtoneRechargeRequestAudit = {
  method: 'POST'
  base_url: string
  path: string
  url: string
  catalog_base_url: string
  hosts_match: boolean
  provider_plan_id: string
  product_id: number
  product_id_source: 'plan_mappings.provider_plan_id'
  body: Record<string, unknown>
  required_credit_party_identifier_fields: string[][]
}

export function buildDtoneRechargeRequestAudit(input: {
  rechargeBaseUrl: string
  catalogBaseUrl: string
  providerPlanId: string
  productId: number
  payload: Record<string, unknown>
  requiredCreditPartyFields: string[][]
}): DtoneRechargeRequestAudit {
  const base = input.rechargeBaseUrl.replace(/\/$/, '')
  const path = resolveDtoneTransactionPath(input.rechargeBaseUrl)
  return {
    method: 'POST',
    base_url: base,
    path,
    url: `${base}${path}`,
    catalog_base_url: input.catalogBaseUrl,
    hosts_match: normalizeHost(input.catalogBaseUrl) === normalizeHost(input.rechargeBaseUrl),
    provider_plan_id: input.providerPlanId,
    product_id: input.productId,
    product_id_source: 'plan_mappings.provider_plan_id',
    body: input.payload,
    required_credit_party_identifier_fields: input.requiredCreditPartyFields,
  }
}

function logDtoneOutgoingRequest(input: {
  method: string
  url: string
  headers: Record<string, string>
  body: unknown
}): void {
  console.log('[DT One Recharge] outgoing_request', {
    method: input.method,
    url: input.url,
    headers: redactAuthHeader(input.headers),
    body: input.body,
  })
}

/** Execute DT One recharge with full audit logging (secrets redacted). */
export async function executeDtoneMappedRecharge(
  ctx: ProviderExecutionContext,
  config: ProviderConfig,
  options?: { systemPlanId?: string | null },
): Promise<{
  ok: boolean
  providerRef?: string
  raw?: unknown
  error?: string
  errorCode?: string
  errorMessage?: string
  requestAudit?: DtoneRechargeRequestAudit
}> {
  const rechargeBaseUrl = (config.baseUrl?.trim() || DEFAULT_DTONE_BASE_URL).trim()
  const catalogBaseUrl = resolveDtoneCatalogBaseUrl(config.baseUrl)

  logDtoneEnvironmentParity({
    catalogBaseUrl,
    rechargeBaseUrl,
    apiDocs: DTONE_TRANSACTION_API_DOCS,
  })

  const rawPlan = await loadProviderRawPlan(ctx.providerId, ctx.providerPlanId)
  const payload = buildDtonePayload({
    providerPlanId: ctx.providerPlanId,
    phoneDigits: ctx.phoneDigits,
    externalId: ctx.externalId,
  })

  const productId = payload.product_id as number
  const idCheck = assertDtoneProductIdSource({
    providerPlanId: ctx.providerPlanId,
    productId,
    systemPlanId: options?.systemPlanId,
    destinationFaceValue: ctx.destination_face_value,
    wholesaleAmount: ctx.provider_wholesale_amount,
  })
  if (!idCheck.valid) {
    console.error('[DT One Recharge] product_id_source_invalid', {
      provider_plan_id: ctx.providerPlanId,
      product_id: productId,
      reason: idCheck.reason,
      destination_face_value: ctx.destination_face_value,
      wholesale_amount: ctx.provider_wholesale_amount,
    })
    return {
      ok: false,
      error: idCheck.reason ?? 'INVALID_PRODUCT_ID_SOURCE',
      errorCode: 'INVALID_PRODUCT_ID_SOURCE',
      errorMessage: idCheck.reason,
      requestAudit: buildDtoneRechargeRequestAudit({
        rechargeBaseUrl,
        catalogBaseUrl,
        providerPlanId: ctx.providerPlanId,
        productId,
        payload,
        requiredCreditPartyFields: extractDtoneRequiredCreditPartyFields(rawPlan?.raw_json),
      }),
    }
  }

  const creditPartyError = validateDtoneCreditPartyPayload(rawPlan?.raw_json, payload)
  if (creditPartyError) {
    console.error('[DT One Recharge] credit_party_validation_failed', {
      provider_plan_id: ctx.providerPlanId,
      product_id: productId,
      required_fields: extractDtoneRequiredCreditPartyFields(rawPlan?.raw_json),
      payload,
      reason: creditPartyError,
    })
    return {
      ok: false,
      error: creditPartyError,
      errorCode: 'INVALID_PAYLOAD',
      errorMessage: creditPartyError,
    }
  }

  const requiredFields = extractDtoneRequiredCreditPartyFields(rawPlan?.raw_json)
  const requestAudit = buildDtoneRechargeRequestAudit({
    rechargeBaseUrl,
    catalogBaseUrl,
    providerPlanId: ctx.providerPlanId,
    productId,
    payload,
    requiredCreditPartyFields: requiredFields,
  })

  const endpointUrl = requestAudit.url
  const apiKey = config.auth?.apiKey?.trim()
  const apiSecret = config.auth?.apiSecret?.trim()
  if (!apiKey || !apiSecret) {
    return {
      ok: false,
      error: 'DT One credentials missing on provider record',
      errorCode: 'CREDENTIALS_MISSING',
      errorMessage: 'DT One credentials missing on provider record',
    }
  }

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  console.log('[DT One Recharge] pre_send', requestAudit)

  logDtoneOutgoingRequest({
    method: 'POST',
    url: endpointUrl,
    headers,
    body: payload,
  })

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      cache: 'no-store',
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    })
    const responseStatus = response.status
    const textBody = await response.text().catch(() => '')
    let responseBody: unknown
    try {
      responseBody = textBody ? JSON.parse(textBody) : null
    } catch {
      responseBody = textBody
    }

    console.log('[DT One Recharge] response', {
      status: responseStatus,
      statusText: response.statusText,
      body: responseBody,
    })

    if (!response.ok) {
      const parsed = parseDtoneApiErrorBody(responseBody, responseStatus)
      if (parsed.providerCode === '1000404') {
        logDtoneProductNotFound({
          productId,
          endpointUrl,
          providerPlanId: ctx.providerPlanId,
          responseStatus,
          responseBody,
        })
      }
      const errMsg =
        parsed.providerMessage ||
        `HTTP ${responseStatus}${textBody ? ` - ${textBody.slice(0, 500)}` : ''}`
      return {
        ok: false,
        error: errMsg,
        errorCode: parsed.providerCode ?? String(responseStatus),
        errorMessage: errMsg,
        raw: responseBody,
        requestAudit,
      }
    }

    if (!builtInSuccessCheck('dtone', responseBody)) {
      const errMsg = builtInErrorMessage('dtone', responseBody) || 'DTONE_DECLINED'
      const parsed = parseDtoneApiErrorBody(responseBody, responseStatus)
      if (parsed.providerCode === '1000404') {
        logDtoneProductNotFound({
          productId,
          endpointUrl,
          providerPlanId: ctx.providerPlanId,
          responseStatus,
          responseBody,
        })
      }
      return {
        ok: false,
        error: errMsg,
        errorCode: parsed.providerCode ?? 'DTONE_DECLINED',
        errorMessage: errMsg,
        raw: responseBody,
        requestAudit,
      }
    }

    const ref = builtInProviderRef('dtone', responseBody, ctx.externalId)
    return { ok: true, providerRef: ref, raw: responseBody, requestAudit }
  } catch (error: unknown) {
    const net = formatFetchError(error)
    const errMsg =
      net.code === 'ENOTFOUND'
        ? `Cannot resolve DT One host (${net.hostname ?? 'unknown'}). Check DNS, VPN, or firewall — the HTTP request never reached DT One.`
        : net.code === 'ECONNREFUSED'
          ? `Connection refused to DT One (${net.hostname ?? endpointUrl}).`
          : net.code === 'UND_ERR_CONNECT_TIMEOUT' || net.code === 'ETIMEDOUT'
            ? `Timed out connecting to DT One (${endpointUrl}).`
            : net.message

    console.error('[DT One Recharge] request_failed', {
      ...requestAudit,
      error: errMsg,
      network_error: net,
    })
    return {
      ok: false,
      error: errMsg,
      errorCode: net.code ?? 'TRANSACTION_ERROR',
      errorMessage: errMsg,
      requestAudit,
    }
  }
}
