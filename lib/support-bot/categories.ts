/** Client-safe support-bot category constants — no DB/server imports. */

export const SUPPORT_BOT_CATEGORIES = [
  'general',
  'transaction',
  'payment',
  'recharge',
  'account',
  'other',
] as const

export type SupportBotCategory = (typeof SUPPORT_BOT_CATEGORIES)[number]
