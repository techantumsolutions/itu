/**
 * Support ticket persistence — JSON file at `data/tickets.json` only.
 * Do not import @supabase/supabase-js here (keeps builds working without that package).
 */
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import type {
  Ticket,
  TicketAdminDetail,
  TicketMessage,
  TicketNote,
  TicketStatus,
  TicketWithThread,
} from './types'

const DATA_DIR = path.join(process.cwd(), 'data')
const DATA_FILE = path.join(DATA_DIR, 'tickets.json')

type DbFile = {
  tickets: Ticket[]
  messages: TicketMessage[]
  notes: TicketNote[]
}

let fileWriteChain: Promise<unknown> = Promise.resolve()

function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = fileWriteChain.then(fn, fn)
  fileWriteChain = run.catch(() => undefined)
  return run
}

async function readDbFile(): Promise<DbFile> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as DbFile
    return {
      tickets: parsed.tickets ?? [],
      messages: parsed.messages ?? [],
      notes: parsed.notes ?? [],
    }
  } catch {
    return { tickets: [], messages: [], notes: [] }
  }
}

async function writeDbFile(db: DbFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8')
}

function nowIso() {
  return new Date().toISOString()
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
  return withFileLock(async () => {
    const db = await readDbFile()
    const id = randomUUID()
    const ts = nowIso()
    const ticket: Ticket = {
      id,
      userId: input.userId,
      userEmail: input.userEmail,
      userName: input.userName,
      transactionId: input.transactionId?.trim() || undefined,
      subject: input.subject.trim(),
      description: input.description.trim(),
      status: 'open',
      createdAt: ts,
      updatedAt: ts,
      attachmentUrl: input.attachmentUrl || undefined,
    }
    db.tickets.push(ticket)
    await writeDbFile(db)
    return ticket
  })
}

export async function listTicketsForUser(userId: string): Promise<Ticket[]> {
  const db = await readDbFile()
  return db.tickets
    .filter((t) => t.userId === userId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export async function getTicketForUser(
  ticketId: string,
  userId: string,
): Promise<TicketWithThread | null> {
  const db = await readDbFile()
  const ticket = db.tickets.find((x) => x.id === ticketId && x.userId === userId)
  if (!ticket) return null
  const messages = db.messages
    .filter((m) => m.ticketId === ticketId)
    .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
  return { ...ticket, messages }
}

export async function listTicketsAdmin(filters: {
  status?: TicketStatus | 'all'
  q?: string
}): Promise<Ticket[]> {
  const db = await readDbFile()
  let list = [...db.tickets]
  if (filters.status && filters.status !== 'all') {
    list = list.filter((t) => t.status === filters.status)
  }
  list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  return applySearchFilter(list, filters.q)
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

export async function getTicketAdmin(ticketId: string): Promise<TicketAdminDetail | null> {
  const db = await readDbFile()
  const ticket = db.tickets.find((x) => x.id === ticketId)
  if (!ticket) return null
  const messages = db.messages
    .filter((m) => m.ticketId === ticketId)
    .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
  const notes = db.notes
    .filter((n) => n.ticketId === ticketId)
    .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
  return { ...ticket, messages, notes }
}

export async function addMessage(input: {
  ticketId: string
  senderType: 'admin' | 'user'
  message: string
}): Promise<TicketMessage> {
  return withFileLock(async () => {
    const db = await readDbFile()
    const id = randomUUID()
    const ts = nowIso()
    const msg: TicketMessage = {
      id,
      ticketId: input.ticketId,
      senderType: input.senderType,
      message: input.message.trim(),
      createdAt: ts,
    }
    db.messages.push(msg)
    const ticket = db.tickets.find((t) => t.id === input.ticketId)
    if (ticket) ticket.updatedAt = ts
    await writeDbFile(db)
    return msg
  })
}

export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<Ticket | null> {
  return withFileLock(async () => {
    const db = await readDbFile()
    const ticket = db.tickets.find((t) => t.id === ticketId)
    if (!ticket) return null
    const ts = nowIso()
    ticket.status = status
    ticket.updatedAt = ts
    await writeDbFile(db)
    return ticket
  })
}

/** After admin sends a public reply, move to in_progress unless already resolved. */
export async function bumpToInProgressIfNeeded(ticketId: string): Promise<void> {
  await withFileLock(async () => {
    const db = await readDbFile()
    const ticket = db.tickets.find((x) => x.id === ticketId)
    if (!ticket || ticket.status === 'resolved') return
    ticket.status = 'in_progress'
    ticket.updatedAt = nowIso()
    await writeDbFile(db)
  })
}

export async function addNote(input: {
  ticketId: string
  note: string
  createdBy: string
}): Promise<TicketNote> {
  return withFileLock(async () => {
    const db = await readDbFile()
    const id = randomUUID()
    const ts = nowIso()
    const note: TicketNote = {
      id,
      ticketId: input.ticketId,
      note: input.note.trim(),
      createdBy: input.createdBy,
      createdAt: ts,
    }
    db.notes.push(note)
    const ticket = db.tickets.find((t) => t.id === input.ticketId)
    if (ticket) ticket.updatedAt = ts
    await writeDbFile(db)
    return note
  })
}
