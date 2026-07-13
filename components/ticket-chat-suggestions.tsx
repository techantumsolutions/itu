'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Suggestion = {
  id: string
  question: string
  answer: string
  category: string
  score: number
}

type Props = {
  subject: string
  description: string
  category?: string | null
  /** Extra text from latest user messages to refine matches */
  latestUserText?: string
  disabled?: boolean
  onPick: (suggestion: Suggestion) => Promise<void> | void
  className?: string
}

export function TicketChatSuggestions({
  subject,
  description,
  category,
  latestUserText,
  disabled,
  onPick,
  className,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [pickingId, setPickingId] = useState<string | null>(null)

  const query = useMemo(() => {
    return [subject, description, latestUserText].filter(Boolean).join('\n').trim()
  }, [subject, description, latestUserText])

  useEffect(() => {
    if (!query || disabled) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/support-bot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, category: category || undefined }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled || !res.ok) return
        const matches = (Array.isArray(data.matches) ? data.matches : []) as Suggestion[]
        setSuggestions(matches.slice(0, 4))
      } catch {
        if (!cancelled) setSuggestions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [query, category, disabled])

  if (disabled) return null
  if (!loading && suggestions.length === 0) return null

  return (
    <div
      className={cn(
        'rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm space-y-3',
        className,
      )}
    >
      <p className="text-sm text-neutral-700">
        Based on your message, these related questions may help:
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Finding related questions…
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={!!pickingId}
              onClick={async () => {
                setPickingId(s.id)
                try {
                  await onPick(s)
                } finally {
                  setPickingId(null)
                }
              }}
              className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-sm text-neutral-800 hover:border-neutral-400 hover:bg-white transition-colors disabled:opacity-60"
            >
              <span className="inline-flex items-center gap-2">
                {pickingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : null}
                {s.question}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
