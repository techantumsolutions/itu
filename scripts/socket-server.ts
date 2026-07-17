import { createServer, type IncomingMessage, type Server as HttpServer } from 'http'
import crypto from 'crypto'
import { Server } from 'socket.io'
import { BROADCAST_SECRET_HEADER, getBroadcastSecret } from '@/lib/tickets/socket-config'

function getRemoteIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim()
  return req.socket?.remoteAddress || 'unknown'
}

/** Timing-safe check of the shared broadcast secret. Never logs the secret. */
function isAuthorizedBroadcast(req: IncomingMessage): boolean {
  let expected: string
  try {
    expected = getBroadcastSecret()
  } catch {
    // Missing secret in production: fail closed.
    return false
  }
  const provided = req.headers[BROADCAST_SECRET_HEADER]
  if (typeof provided !== 'string' || provided.length === 0) return false
  const providedBuf = Buffer.from(provided)
  const expectedBuf = Buffer.from(expected)
  if (providedBuf.length !== expectedBuf.length) return false
  return crypto.timingSafeEqual(providedBuf, expectedBuf)
}

function logUnauthorizedBroadcast(req: IncomingMessage): void {
  console.warn('[SocketServer] Unauthorized broadcast attempt', {
    timestamp: new Date().toISOString(),
    ip: getRemoteIp(req),
    path: req.url,
    userAgent: req.headers['user-agent'] || 'unknown',
  })
}

let shuttingDown = false

const server: HttpServer = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    if (shuttingDown) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, service: 'socket', shuttingDown: true }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'socket' }))
    return
  }

  if (shuttingDown) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'shutting_down' }))
    return
  }

  // Handle HTTP POST request to broadcast events (server-to-server only; no browser CORS).
  if (req.method === 'POST' && req.url === '/api/broadcast') {
    const contentType = req.headers['content-type'] || ''
    if (!contentType.includes('application/json')) {
      res.writeHead(415, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Content-Type must be application/json' }))
      return
    }

    if (!isAuthorizedBroadcast(req)) {
      logUnauthorizedBroadcast(req)
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }

    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body)
        const { type, ticketId, data } = payload

        if (!ticketId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'ticketId is required' }))
          return
        }

        if (type === 'message') {
          io.to(ticketId).emit('message', data)
          console.log(`[SocketServer] Broadcasted message to room ${ticketId}`)
        } else if (type === 'status_update') {
          io.to(ticketId).emit('status_update', data)
          console.log(`[SocketServer] Broadcasted status update (${data}) to room ${ticketId}`)
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid type' }))
          return
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid JSON' }))
      }
    })
  } else {
    res.writeHead(404)
    res.end()
  }
})

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

io.use((socket, next) => {
  if (shuttingDown) {
    next(new Error('shutting_down'))
    return
  }
  next()
})

io.on('connection', (socket) => {
  console.log(`[SocketServer] Client connected: ${socket.id}`)

  socket.on('join', (ticketId: string) => {
    socket.join(ticketId)
    console.log(`[SocketServer] Client ${socket.id} joined room ${ticketId}`)
  })

  socket.on('disconnect', () => {
    console.log(`[SocketServer] Client disconnected: ${socket.id}`)
  })
})

const PORT = Number(process.env.SOCKET_PORT || 3001)
const HOST = process.env.SOCKET_BIND_HOST || '0.0.0.0'

server.listen(PORT, HOST, () => {
  console.log(`[SocketServer] Standalone Socket.io server running on http://${HOST}:${PORT}`)
})

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[SocketServer] ${signal} received — stop accepting new connections`)

  // Stop accepting new TCP/HTTP connections; in-flight requests may finish.
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })

  // Disconnect existing Socket.IO clients and close the engine.
  await new Promise<void>((resolve) => {
    io.close(() => resolve())
  })

  console.log('[SocketServer] shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})
process.on('SIGINT', () => {
  void shutdown('SIGINT')
})
