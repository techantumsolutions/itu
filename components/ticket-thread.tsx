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
    ...messages.map(m => {
      const sType = m.senderType || (m as any).sender_type || 'user'
      const cAt = m.createdAt || (m as any).created_at || new Date().toISOString()
      return {
        id: m.id,
        senderType: sType,
        message: m.message,
        createdAt: cAt,
        isOriginal: false,
      }
    })
  ]

  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-6 shadow-inner max-h-[400px] overflow-y-auto flex flex-col gap-5">
      {allMessages.map((msg) => {
        console.log("each message:::::", msg);
        const sType = msg.senderType || (msg as any).sender_type || 'user'
        // Determine if outgoing from perspective of variant
        const isOutgoing = variant === 'user'
          ? sType === 'user'
          : sType === 'admin'

        // Determine sender display name
        let senderName = ''
        let avatarText = ''
        let avatarBg = ''

        if (sType === 'user') {
          senderName = variant === 'user' ? 'You' : 'Customer'
          avatarText = 'C'
          avatarBg = 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
        } else {
          senderName = variant === 'admin' ? 'You (Support)' : 'Support Team'
          avatarText = 'S'
          avatarBg = 'bg-neutral-800 text-white shadow-sm shadow-neutral-800/20'
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
                isOutgoing
                  ? variant === 'user'
                    ? 'bg-orange-100 text-orange-700 border border-orange-200'
                    : 'bg-neutral-100 text-neutral-800 border border-neutral-200'
                  : avatarBg
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
                  'rounded-2xl px-4 py-3 text-sm shadow-md border whitespace-pre-wrap transition-all duration-200 hover:shadow-lg',
                  isOutgoing
                    ? variant === 'user'
                      ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white border-transparent rounded-br-none'
                      : 'bg-gradient-to-br from-neutral-800 to-neutral-900 text-white border-transparent rounded-br-none'
                    : variant === 'user'
                      ? 'bg-white border-neutral-200/80 text-neutral-900 rounded-bl-none'
                      : 'bg-orange-50/70 border-orange-100/80 text-neutral-900 rounded-bl-none'
                )}
              >
                {/* Message Body */}
                <p className="leading-relaxed font-medium">{msg.message}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
