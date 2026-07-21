import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  SUPPORT_BOT_CATEGORIES,
  type SupportBotCategory,
} from '@/lib/support-bot/categories'

export { SUPPORT_BOT_CATEGORIES, type SupportBotCategory } from '@/lib/support-bot/categories'

export type SupportBotQa = {
  id: string
  question: string
  answer: string
  keywords: string[]
  category: SupportBotCategory
  isSuggested: boolean
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type SupportBotQaInput = {
  question: string
  answer: string
  keywords?: string[]
  category?: SupportBotCategory
  isSuggested?: boolean
  isActive?: boolean
  sortOrder?: number
}

type SupportBotQaRow = {
  id: string
  question: string
  answer: string
  keywords: string[] | null
  category: string
  is_suggested: boolean
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

const MATCH_THRESHOLD = 0.22

function normalizeCategory(value: unknown): SupportBotCategory {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return (SUPPORT_BOT_CATEGORIES as readonly string[]).includes(v)
    ? (v as SupportBotCategory)
    : 'general'
}

function normalizeKeywords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((k) => String(k).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 40)
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;\n]+/)
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 40)
  }
  return []
}

export function toSupportBotQa(row: SupportBotQaRow): SupportBotQa {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    category: normalizeCategory(row.category),
    isSuggested: !!row.is_suggested,
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1)
}

/** Score how well a user query matches a Q&A entry (0–1). */
export function scoreQaMatch(query: string, item: SupportBotQa): number {
  const qTokens = new Set(tokenize(query))
  if (qTokens.size === 0) return 0

  const questionTokens = tokenize(item.question)
  const keywordSet = new Set(item.keywords.map((k) => k.toLowerCase()))
  const answerTokens = tokenize(item.answer).slice(0, 40)

  let hit = 0
  let weight = 0

  for (const token of qTokens) {
    weight += 1
    if (questionTokens.includes(token)) hit += 1.4
    else if (keywordSet.has(token)) hit += 1.2
    else if (answerTokens.includes(token)) hit += 0.35
    else if (item.question.toLowerCase().includes(token)) hit += 0.6
  }

  // Exact / near phrase boost
  const qLower = query.trim().toLowerCase()
  const questionLower = item.question.toLowerCase()
  if (qLower === questionLower) hit += 3
  else if (questionLower.includes(qLower) || qLower.includes(questionLower)) hit += 1.5

  return weight > 0 ? Math.min(1, hit / (weight * 1.4)) : 0
}

export function findBestMatches(
  query: string,
  items: SupportBotQa[],
  limit = 3,
): Array<SupportBotQa & { score: number }> {
  const active = items.filter((i) => i.isActive)
  return active
    .map((item) => ({ ...item, score: scoreQaMatch(query, item) }))
    .filter((item) => item.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.sortOrder - b.sortOrder)
    .slice(0, limit)
}

export async function listSupportBotQa(opts?: {
  activeOnly?: boolean
}): Promise<SupportBotQa[]> {
  const filters = ['select=*']
  if (opts?.activeOnly) filters.push('is_active=eq.true')
  filters.push('order=sort_order.asc,created_at.desc')

  const res = await supabaseRest(`support_bot_qa?${filters.join('&')}`, { cache: 'no-store' })
  if (!res.ok) {
    if (res.status === 404 || res.status === 406) return []
    throw new Error(await res.text())
  }
  const rows = (await res.json()) as SupportBotQaRow[]
  return rows.map(toSupportBotQa)
}

export async function getSupportBotQa(id: string): Promise<SupportBotQa | null> {
  const res = await supabaseRest(
    `support_bot_qa?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  const rows = (await res.json()) as SupportBotQaRow[]
  return rows[0] ? toSupportBotQa(rows[0]) : null
}

export function validateSupportBotQaInput(body: unknown): SupportBotQaInput | { error: string } {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const question = typeof raw.question === 'string' ? raw.question.trim() : ''
  const answer = typeof raw.answer === 'string' ? raw.answer.trim() : ''
  if (!question) return { error: 'Question is required' }
  if (!answer) return { error: 'Answer is required' }
  if (question.length > 500) return { error: 'Question is too long (max 500)' }
  if (answer.length > 5000) return { error: 'Answer is too long (max 5000)' }

  return {
    question,
    answer,
    keywords: normalizeKeywords(raw.keywords),
    category: normalizeCategory(raw.category),
    isSuggested: raw.isSuggested === true || raw.is_suggested === true,
    isActive: raw.isActive !== false && raw.is_active !== false,
    sortOrder:
      typeof raw.sortOrder === 'number'
        ? raw.sortOrder
        : typeof raw.sort_order === 'number'
          ? raw.sort_order
          : Number(raw.sortOrder ?? raw.sort_order) || 0,
  }
}

export async function createSupportBotQa(input: SupportBotQaInput): Promise<SupportBotQa> {
  const res = await supabaseRest('support_bot_qa?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        question: input.question,
        answer: input.answer,
        keywords: input.keywords ?? [],
        category: input.category ?? 'general',
        is_suggested: !!input.isSuggested,
        is_active: input.isActive !== false,
        sort_order: input.sortOrder ?? 0,
      },
    ]),
  })
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as SupportBotQaRow[]
  return toSupportBotQa(rows[0]!)
}

export async function updateSupportBotQa(
  id: string,
  input: SupportBotQaInput,
): Promise<SupportBotQa | null> {
  const res = await supabaseRest(`support_bot_qa?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      question: input.question,
      answer: input.answer,
      keywords: input.keywords ?? [],
      category: input.category ?? 'general',
      is_suggested: !!input.isSuggested,
      is_active: input.isActive !== false,
      sort_order: input.sortOrder ?? 0,
      updated_at: new Date().toISOString(),
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as SupportBotQaRow[]
  return rows[0] ? toSupportBotQa(rows[0]) : null
}

export async function deleteSupportBotQa(id: string): Promise<boolean> {
  const res = await supabaseRest(`support_bot_qa?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return res.ok
}

export async function matchSupportBotAnswer(
  query: string,
  opts?: { category?: string | null; limit?: number },
): Promise<{
  matches: Array<SupportBotQa & { score: number }>
  best: (SupportBotQa & { score: number }) | null
}> {
  let items = await listSupportBotQa({ activeOnly: true })
  const category = opts?.category?.trim().toLowerCase()
  if (category && category !== 'general') {
    const filtered = items.filter((i) => i.category === category)
    // Prefer category matches; fall back to all if none
    if (filtered.length > 0) items = filtered
  }
  const matches = findBestMatches(query, items, opts?.limit ?? 5)
  return { matches, best: matches[0] ?? null }
}

export function formatBotTicketReply(qa: SupportBotQa): string {
  return [
    qa.answer,
    '',
    'If this does not resolve your issue, reply on this ticket and our support team will follow up.',
  ].join('\n')
}
