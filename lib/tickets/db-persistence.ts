import { supabaseRest } from '@/lib/db/supabase-rest'
import type {
  Ticket,
  TicketAdminDetail,
  TicketMessage,
  TicketNote,
  TicketStatus,
  TicketWithThread,
} from './types'
import * as filePersistence from './persistence'

type TicketRow = {
  id: string
  user_id: string | null
  user_email: string | null
  user_name: string | null
  transaction_id: string | null
  subject: string
  description: string
  status: TicketStatus
  attachment_url: string | null
  created_at: string
  updated_at: string
}

type MessageRow = {
  id: string
  ticket_id: string
  sender_type: 'admin' | 'user'
  message: string
  created_at: string
}

type NoteRow = {
  id: string
  ticket_id: string
  note: string
  created_by: string
  created_at: string
}

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    userId: row.user_id ?? '',
    userEmail: row.user_email ?? '',
    userName: row.user_name ?? '',
    transactionId: row.transaction_id ?? undefined,
    subject: row.subject,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachmentUrl: row.attachment_url ?? undefined,
  }
}

function toMessage(row: MessageRow): TicketMessage {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    senderType: row.sender_type,
    message: row.message,
    createdAt: row.created_at,
  }
}

function toNote(row: NoteRow): TicketNote {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function encode(value: string): string {
  return encodeURIComponent(value)
}

async function isTableMissing(res: Response): Promise<boolean> {
  if (res.status === 404) {
    try {
      const text = await res.clone().text()
      return text.includes('PGRST205') || text.includes('support_tickets') || text.includes('ticket_messages') || text.includes('ticket_notes')
    } catch {
      return true
    }
  }
  return false
}

async function selectTicketById(ticketId: string): Promise<TicketRow | null> {
  const res = await supabaseRest(
    `support_tickets?id=eq.${encode(ticketId)}&select=id,user_id,user_email,user_name,transaction_id,subject,description,status,attachment_url,created_at,updated_at&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) {
    if (await isTableMissing(res)) {
      throw new Error('Table support_tickets not found')
    }
    throw new Error('Failed to load ticket')
  }
  const rows = (await res.json()) as TicketRow[]
  return rows[0] ?? null
}

async function selectMessages(ticketId: string): Promise<TicketMessage[]> {
  const res = await supabaseRest(
    `ticket_messages?ticket_id=eq.${encode(ticketId)}&select=id,ticket_id,sender_type,message,created_at&order=created_at.asc`,
    { cache: 'no-store' },
  )
  if (!res.ok) {
    if (await isTableMissing(res)) {
      throw new Error('Table ticket_messages not found')
    }
    throw new Error('Failed to load ticket messages')
  }
  return ((await res.json()) as MessageRow[]).map(toMessage)
}

async function selectNotes(ticketId: string): Promise<TicketNote[]> {
  const res = await supabaseRest(
    `ticket_notes?ticket_id=eq.${encode(ticketId)}&select=id,ticket_id,note,created_by,created_at&order=created_at.asc`,
    { cache: 'no-store' },
  )
  if (!res.ok) {
    if (await isTableMissing(res)) {
      throw new Error('Table ticket_notes not found')
    }
    throw new Error('Failed to load ticket notes')
  }
  return ((await res.json()) as NoteRow[]).map(toNote)
}

export async function createTicket(input: {
  userId: string
  userEmail: string
  userName: string
  transactionId?: string
  subject: string
  description: string
  attachmentUrl?: string
}): Promise<Ticket> {
  try {
    const res = await supabaseRest('support_tickets?select=id,user_id,user_email,user_name,transaction_id,subject,description,status,attachment_url,created_at,updated_at', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          user_id: input.userId,
          user_email: input.userEmail,
          user_name: input.userName,
          transaction_id: input.transactionId?.trim() || null,
          subject: input.subject.trim(),
          description: input.description.trim(),
          status: 'open',
          attachment_url: input.attachmentUrl || null,
        },
      ]),
    })
    if (!res.ok) {
      if (await isTableMissing(res)) {
        return filePersistence.createTicket(input)
      }
      throw new Error('Failed to create ticket')
    }
    const rows = (await res.json()) as TicketRow[]
    return toTicket(rows[0]!)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('SUPABASE_URL') || msg.includes('not found')) {
      return filePersistence.createTicket(input)
    }
    throw err
  }
}

export async function listTicketsForUser(userId: string): Promise<Ticket[]> {
  try {
    const res = await supabaseRest(
      `support_tickets?user_id=eq.${encode(userId)}&select=id,user_id,user_email,user_name,transaction_id,subject,description,status,attachment_url,created_at,updated_at&order=updated_at.desc`,
      { cache: 'no-store' },
    )
    if (!res.ok) {
      if (await isTableMissing(res)) {
        return filePersistence.listTicketsForUser(userId)
      }
      throw new Error('Failed to load tickets')
    }
    return ((await res.json()) as TicketRow[]).map(toTicket)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('SUPABASE_URL') || msg.includes('not found')) {
      return filePersistence.listTicketsForUser(userId)
    }
    throw err
  }
}

export async function getTicketForUser(ticketId: string, userId: string): Promise<TicketWithThread | null> {
  try {
    const row = await selectTicketById(ticketId)
    if (!row || row.user_id !== userId) return null
    return { ...toTicket(row), messages: await selectMessages(ticketId) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('SUPABASE_URL') || msg.includes('not found')) {
      return filePersistence.getTicketForUser(ticketId, userId)
    }
    throw err
  }
}

function applySearchFilter(tickets: Ticket[], q?: string): Ticket[] {
  if (!q?.trim()) return tickets
  const s = q.trim().toLowerCase()
  return tickets.filter(
    (t) =>
      t.id.toLowerCase().includes(s) ||
      t.userEmail.toLowerCase().includes(s) ||
      t.subject.toLowerCase().includes(s) ||
      (t.transactionId?.toLowerCase().includes(s) ?? false),
  )
}

export async function listTicketsAdmin(filters: { status?: TicketStatus | 'all'; q?: string }): Promise<Ticket[]> {
  try {
    const status = filters.status && filters.status !== 'all' ? `status=eq.${encode(filters.status)}&` : ''
    const res = await supabaseRest(
      `support_tickets?${status}select=id,user_id,user_email,user_name,transaction_id,subject,description,status,attachment_url,created_at,updated_at&order=updated_at.desc`,
      { cache: 'no-store' },
    )
    if (!res.ok) {
      if (await isTableMissing(res)) {
        return filePersistence.listTicketsAdmin(filters)
      }
      throw new Error('Failed to load tickets')
    }
    return applySearchFilter(((await res.json()) as TicketRow[]).map(toTicket), filters.q)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('SUPABASE_URL') || msg.includes('not found')) {
      return filePersistence.listTicketsAdmin(filters)
    }
    throw err
  }
}

export async function getTicketAdmin(ticketId: string): Promise<TicketAdminDetail | null> {
  try {
    const row = await selectTicketById(ticketId)
    if (!row) return null

    let transactionDetails = undefined
    if (row.transaction_id) {
      const txRes = await supabaseRest(
        `transactions?id=eq.${encode(row.transaction_id)}&select=amount,currency,status,description,created_at,metadata,recharge_orders(operator_name),profiles(name)&limit=1`,
        { cache: 'no-store' }
      )
      if (txRes.ok) {
        const txRows = await txRes.json()
        const tx = txRows[0]
        if (tx) {
          const rechargeOrder = tx.recharge_orders?.[0]
          let operatorName = rechargeOrder?.operator_name || tx.metadata?.carrierName || tx.metadata?.operator_name
          if (!operatorName && tx.metadata?.operator_id) {
            const sysOpRes = await supabaseRest(
              `system_operators?id=eq.${encode(tx.metadata.operator_id)}&select=system_operator_name&limit=1`,
              { cache: 'no-store' }
            )
            if (sysOpRes.ok) {
              const sysOpRows = await sysOpRes.json()
              operatorName = sysOpRows[0]?.system_operator_name
            }
          }
          transactionDetails = {
            amount: Number(tx.amount) || 0,
            currency: String(tx.currency || ''),
            status: String(tx.status || ''),
            createdAt: String(tx.created_at || ''),
            description: String(tx.description || ''),
            operatorName: operatorName ? String(operatorName) : undefined,
            userName: tx.profiles?.name ? String(tx.profiles.name) : undefined,
          }
        }
      }
    }

    return {
      ...toTicket(row),
      transactionDetails,
      messages: await selectMessages(ticketId),
      notes: await selectNotes(ticketId),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('SUPABASE_URL') || msg.includes('not found')) {
      return filePersistence.getTicketAdmin(ticketId)
    }
    throw err
  }
}

export async function addMessage(input: {
  ticketId: string
  senderType: 'admin' | 'user'
  message: string
}): Promise<TicketMessage> {
  try {
    const res = await supabaseRest('ticket_messages?select=id,ticket_id,sender_type,message,created_at', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          ticket_id: input.ticketId,
          sender_type: input.senderType,
          message: input.message.trim(),
        },
      ]),
    })
    if (!res.ok) {
      if (await isTableMissing(res)) {
        return filePersistence.addMessage(input)
      }
      throw new Error('Failed to add message')
    }
    await supabaseRest(`support_tickets?id=eq.${encode(input.ticketId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
    })
    const rows = (await res.json()) as MessageRow[]
    return toMessage(rows[0]!)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('SUPABASE_URL') || msg.includes('not found')) {
      return filePersistence.addMessage(input)
    }
    throw err
  }
}

export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<Ticket | null> {
  try {
    const res = await supabaseRest(
      `support_tickets?id=eq.${encode(ticketId)}&select=id,user_id,user_email,user_name,transaction_id,subject,description,status,created_at,updated_at`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status }),
      },
    )
    if (!res.ok) {
      if (await isTableMissing(res)) {
        return filePersistence.setTicketStatus(ticketId, status)
      }
      throw new Error('Failed to update ticket')
    }
    const rows = (await res.json()) as TicketRow[]
    return rows[0] ? toTicket(rows[0]) : null
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('SUPABASE_URL') || msg.includes('not found')) {
      return filePersistence.setTicketStatus(ticketId, status)
    }
    throw err
  }
}

/** After admin sends a public reply, move to in_progress unless already resolved. */
export async function bumpToInProgressIfNeeded(ticketId: string): Promise<void> {
  try {
    const row = await selectTicketById(ticketId)
    if (!row || row.status === 'resolved') return
    await setTicketStatus(ticketId, 'in_progress')
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('SUPABASE_URL') || msg.includes('not found')) {
      return filePersistence.bumpToInProgressIfNeeded(ticketId)
    }
    throw err
  }
}

export async function addNote(input: { ticketId: string; note: string; createdBy: string }): Promise<TicketNote> {
  try {
    const res = await supabaseRest('ticket_notes?select=id,ticket_id,note,created_by,created_at', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          ticket_id: input.ticketId,
          note: input.note.trim(),
          created_by: input.createdBy,
        },
      ]),
    })
    if (!res.ok) {
      if (await isTableMissing(res)) {
        return filePersistence.addNote(input)
      }
      throw new Error('Failed to add note')
    }
    await supabaseRest(`support_tickets?id=eq.${encode(input.ticketId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
    })
    const rows = (await res.json()) as NoteRow[]
    return toNote(rows[0]!)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('SUPABASE_URL') || msg.includes('not found')) {
      return filePersistence.addNote(input)
    }
    throw err
  }
}
