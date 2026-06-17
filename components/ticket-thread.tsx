'use client'

import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { TicketMessage } from '@/lib/tickets/types'

export function TicketThread({
  description,
  messages,
  variant = 'user',
  ticketCreatedAt,
}: {
  description: string
  messages: TicketMessage[]
  variant?: 'user' | 'admin'
  ticketCreatedAt?: string
}) {
  const firstMessageDate = ticketCreatedAt ? new Date(ticketCreatedAt) : new Date()

  // Format date helper
  const formatDate = (date: Date | string) => {
    try {
      return format(new Date(date), 'MMM d, yyyy HH:mm')
    } catch {
      return ''
    }
  }

  // Map messages to include the first ticket description message at index 0
  const allMessages = [
    {
      id: 'original-ticket-desc',
      senderType: 'user' as const,
      message: description,
      createdAt: firstMessageDate.toISOString(),
      isOriginal: true,
    },
    ...messages.map(m => ({
      id: m.id,
      senderType: m.senderType,
      message: m.message,
      createdAt: m.createdAt,
      isOriginal: false,
    }))
  ]

  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-6 shadow-inner max-h-[600px] overflow-y-auto flex flex-col gap-5">
      {allMessages.map((msg) => {
        // Determine if outgoing from perspective of variant
        const isOutgoing = variant === 'user' 
          ? msg.senderType === 'user'
          : msg.senderType === 'admin'

        // Determine sender display name
        let senderName = ''
        let avatarText = ''
        let avatarBg = ''

        if (msg.senderType === 'user') {
          senderName = variant === 'user' ? 'You' : 'Customer'
          avatarText = 'C'
          avatarBg = 'bg-orange-500 text-white'
        } else {
          senderName = variant === 'admin' ? 'You (Support)' : 'Support Team'
          avatarText = 'S'
          avatarBg = 'bg-neutral-800 text-white'
        }

        return (
          <div
            key={msg.id}
            className={cn(
              'flex items-end gap-2.5 max-w-[85%]',
              isOutgoing ? 'self-end flex-row-reverse' : 'self-start flex-row'
            )}
          >
            {/* Avatar Badge */}
            <div
              className={cn(
                'flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full text-[10px] font-bold shadow-sm',
                isOutgoing ? 'bg-neutral-100 text-neutral-800 border border-neutral-200 shadow-sm' : avatarBg
              )}
            >
              {isOutgoing ? 'You' : avatarText}
            </div>

            {/* Bubble Container */}
            <div className="flex flex-col gap-1">
              {/* Sender Name & Timestamp */}
              <div
                className={cn(
                  'flex items-center gap-2 text-[10px] text-muted-foreground',
                  isOutgoing ? 'justify-end' : 'justify-start'
                )}
              >
                <span className="font-semibold text-foreground/80">{senderName}</span>
                <span>•</span>
                <time dateTime={msg.createdAt}>{formatDate(msg.createdAt)}</time>
              </div>

              {/* Message Bubble */}
              <div
                className={cn(
                  'rounded-2xl px-4 py-3 text-sm shadow-sm border whitespace-pre-wrap',
                  isOutgoing
                    ? 'bg-orange-500/10 border-orange-500/20 text-neutral-900 rounded-br-none'
                    : 'bg-white border-neutral-200/80 text-neutral-900 rounded-bl-none'
                )}
              >
                {/* Message Body */}
                <p className="leading-relaxed">{msg.message}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
