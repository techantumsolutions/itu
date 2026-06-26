import { getSocketBroadcastUrl, isSocketServerConfigured } from '@/lib/tickets/socket-config'

type BroadcastPayload =
  | { type: 'message'; ticketId: string; data: unknown }
  | { type: 'status_update'; ticketId: string; data: string }

async function postBroadcast(payload: BroadcastPayload): Promise<void> {
  if (!isSocketServerConfigured()) return

  try {
    const res = await fetch(getSocketBroadcastUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.error(`Socket broadcast failed with status ${res.status}: ${await res.text()}`)
    }
  } catch (err) {
    console.error('[SocketNotifier] Failed to notify socket server:', err)
  }
}

export async function notifyNewMessage(ticketId: string, message: unknown) {
  await postBroadcast({ type: 'message', ticketId, data: message })
}

export async function notifyStatusUpdate(ticketId: string, status: string) {
  await postBroadcast({ type: 'status_update', ticketId, data: status })
}
