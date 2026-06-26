import { createServer } from 'http'
import { Server } from 'socket.io'

const server = createServer((req, res) => {
  // Handle CORS for HTTP endpoint
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Handle HTTP POST request to broadcast events
  if (req.method === 'POST' && req.url === '/api/broadcast') {
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
      } catch (err) {
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
