import { Badge } from '@/components/ui/badge'
import type { TicketStatus } from '@/lib/tickets/types'
import { cn } from '@/lib/utils'

const labels: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
}

const hints: Record<TicketStatus, string> = {
  open: 'Waiting for admin',
  in_progress: 'Admin responded',
  resolved: 'Closed',
}

export function TicketStatusBadge({ status, showHint }: { status: TicketStatus; showHint?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Badge
        variant="secondary"
        className={cn(
          'w-fit font-medium',
          status === 'open' && 'border-red-200/80 bg-red-50 text-red-800   ',
          status === 'in_progress' &&
            'border-amber-200/80 bg-amber-50 text-amber-900   ',
          status === 'resolved' &&
            'border-emerald-200/80 bg-emerald-50 text-emerald-800   ',
        )}
      >
        {labels[status]}
      </Badge>
      {showHint ? <span className="text-xs text-muted-foreground">{hints[status]}</span> : null}
    </div>
  )
}
