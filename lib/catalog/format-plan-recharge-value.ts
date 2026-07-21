/** Client-safe plan recharge display formatting — no DB/server imports. */

export function formatPlanRechargeValue(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return '—'
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  const code = (currency ?? '').trim().toUpperCase()
  return code ? `${formatted} ${code}` : formatted
}
