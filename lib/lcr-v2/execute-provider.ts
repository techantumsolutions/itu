import { createDtoneTransaction } from '@/lib/dtone'
import { createValuetopupTransaction } from '@/lib/valuetopup'
import { isApiConfigured, sendTransfer } from '@/lib/api/ding-connect'

export type ExecuteResult = { ok: boolean; providerRef?: string; raw?: unknown; error?: string }

/** Execute recharge on the mapped provider (adapter-based). */
export async function executeMappedRecharge(input: {
  adapterKey: string
  providerPlanId: string
  phoneDigits: string
  externalId: string
  sendAmount?: number
}): Promise<ExecuteResult> {
  const key = (input.adapterKey || '').toLowerCase()

  if (key === 'dtone') {
    const productId = Number(input.providerPlanId)
    if (!Number.isFinite(productId) || productId < 1) {
      return { ok: false, error: 'INVALID_PRODUCT_ID' }
    }
    try {
      const raw = (await createDtoneTransaction({
        external_id: input.externalId,
        product_id: productId,
        credit_party_identifier: { mobile_number: input.phoneDigits },
        auto_confirm: true,
      })) as Record<string, unknown>
      const statusId = (raw as any)?.status?.id
      if (statusId === 3 || statusId === 9) {
        return { ok: false, error: 'DTONE_DECLINED', raw }
      }
      const ref = (raw as any)?.id != null ? String((raw as any).id) : input.externalId
      return { ok: true, providerRef: ref, raw }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'DTONE_ERROR' }
    }
  }

  if (key === 'valuetopup') {
    const sep = input.providerPlanId.indexOf(':')
    const product = sep > 0 ? input.providerPlanId.slice(0, sep) : input.providerPlanId
    const amountFromId = sep > 0 ? Number(input.providerPlanId.slice(sep + 1)) : NaN
    const amount =
      Number.isFinite(amountFromId) && amountFromId > 0
        ? amountFromId
        : typeof input.sendAmount === 'number' && input.sendAmount > 0
          ? input.sendAmount
          : 0
    if (!product || !amount) return { ok: false, error: 'VALUETOPUP_AMOUNT_REQUIRED' }
    try {
      const raw = await createValuetopupTransaction({
        refid: input.externalId.slice(0, 50),
        product,
        account: input.phoneDigits,
        amount,
      })
      const status = textStatus(raw?.status)
      if (status === 'failed') {
        return { ok: false, error: textStatus(raw?.remarks) || 'VALUETOPUP_FAILED', raw }
      }
      if (status === 'succesful' || status === 'successful' || status === 'accepted' || status === 'processing') {
        const ref = raw?.refid != null ? String(raw.refid) : input.externalId
        return { ok: true, providerRef: ref, raw }
      }
      return { ok: false, error: 'VALUETOPUP_UNKNOWN_STATUS', raw }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'VALUETOPUP_ERROR' }
    }
  }

  if (key === 'ding') {
    if (!isApiConfigured()) {
      return { ok: false, error: 'DING_NOT_CONFIGURED' }
    }
    const send = typeof input.sendAmount === 'number' && input.sendAmount > 0 ? input.sendAmount : 0
    if (!send) return { ok: false, error: 'DING_SEND_AMOUNT_REQUIRED' }
    try {
      const response = await sendTransfer({
        SkuCode: input.providerPlanId,
        SendValue: send,
        AccountNumber: input.phoneDigits,
        DistributorRef: input.externalId,
        ValidateOnly: false,
      })
      if (response.ResultCode !== 1) {
        return { ok: false, error: response.ErrorCodes?.[0]?.Code || 'DING_FAILED', raw: response }
      }
      const ref = response.TransferRecord?.TransferId?.TransferRef ?? input.externalId
      return { ok: true, providerRef: ref, raw: response }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'DING_ERROR' }
    }
  }

  return { ok: false, error: `ADAPTER_NOT_IMPLEMENTED:${input.adapterKey}` }
}

function textStatus(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : ''
}
