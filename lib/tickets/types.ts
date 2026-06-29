export type TicketStatus = 'open' | 'in_progress' | 'resolved'

export type SenderType = 'admin' | 'user'

export interface Ticket {
  id: string
  userId: string
  userEmail: string
  userName: string
  transactionId?: string
  transactionDetails?: {
    amount: number
    currency: string
    status: string
    createdAt: string
    description?: string
    operatorName?: string
    userName?: string
  }
  subject: string
  description: string
  status: TicketStatus
  createdAt: string
  updatedAt: string
  attachmentUrl?: string
}

export interface TicketMessage {
  id: string
  ticketId: string
  senderType: SenderType
  message: string
  createdAt: string
}

export interface TicketNote {
  id: string
  ticketId: string
  note: string
  createdBy: string
  createdAt: string
}

export interface TicketWithThread extends Ticket {
  messages: TicketMessage[]
}

export interface TicketAdminDetail extends TicketWithThread {
  notes: TicketNote[]
}
