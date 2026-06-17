export async function notifyNewMessage(ticketId: string, message: any) {
  try {
    const res = await fetch('http://localhost:3001/api/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'message',
        ticketId,
        data: message,
      }),
    })
    if (!res.ok) {
      console.error(`Socket broadcast failed with status ${res.status}: ${await res.text()}`)
    }
  } catch (err) {
    console.error('[SocketNotifier] Failed to notify socket server of new message:', err)
  }
}

export async function notifyStatusUpdate(ticketId: string, status: string) {
  try {
    const res = await fetch('http://localhost:3001/api/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'status_update',
        ticketId,
        data: status,
      }),
    })
    if (!res.ok) {
      console.error(`Socket broadcast failed with status ${res.status}: ${await res.text()}`)
    }
  } catch (err) {
    console.error('[SocketNotifier] Failed to notify socket server of status update:', err)
  }
}
