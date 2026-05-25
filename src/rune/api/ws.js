import { WebSocket } from 'ws'

class WsSession {
  constructor(url, options) {
    this.url = url
    this.options = options ?? {}
    this.state = 'CREATED'
    this.socket = null
    this.handlers = new Map()
    this.closedPromise = new Promise((resolve) => {
      this.closedResolve = resolve
    })
  }

  setHandler(event, callbackRef) {
    this.handlers.set(event, callbackRef)
  }

  open() {
    if (this.state !== 'CREATED') throw new Error(`Cannot open socket in state ${this.state}`)
    return new Promise((resolve, reject) => {
      const wsOpts = this.options.headers ? { headers: this.options.headers } : undefined
      const socket = new WebSocket(this.url, wsOpts)
      this.socket = socket
      let opened = false

      socket.on('open', async () => {
        opened = true
        this.state = 'OPEN'
        const h = this.handlers.get('open')
        if (h) await h.apply(undefined, [], { result: { promise: true } }).catch(() => {})
        resolve()
      })

      socket.on('error', (err) => {
        if (!opened) reject(err)
        const h = this.handlers.get('error')
        if (h) {
          const errData = JSON.stringify({
            message: err.message,
            code: err.code ?? null,
            stack: err.stack ?? null
          })
          h.apply(undefined, [errData], { result: { promise: true } }).catch(() => {})
        }
      })

      socket.on('message', async (data, isBinary) => {
        if (isBinary) {
          const h = this.handlers.get('binary')
          if (h) {
            const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
            await h.apply(undefined, [arrayBuffer], { arguments: { copy: true }, result: { promise: true } }).catch(() => {})
          }
        } else {
          const h = this.handlers.get('message')
          if (h) await h.apply(undefined, [String(data)], { result: { promise: true } })
        }
      })

      socket.on('close', async (code, reason) => {
        this.state = 'CLOSED'
        const reasonStr = reason ? String(reason) : ''
        const h = this.handlers.get('close')
        if (h) await h.apply(undefined, [code, reasonStr], { result: { promise: true } }).catch(() => {})
        this.closedResolve({ code, reason: reasonStr })
      })
    })
  }

  sendText(message) {
    if (this.state !== 'OPEN') throw new Error(`Cannot send in state ${this.state}`)
    return new Promise((resolve, reject) => {
      this.socket.send(message, (err) => (err ? reject(err) : resolve()))
    })
  }

  sendBinary(arrayBuffer, byteOffset, byteLength) {
    if (this.state !== 'OPEN') throw new Error(`Cannot send in state ${this.state}`)
    return new Promise((resolve, reject) => {
      const buffer = Buffer.from(arrayBuffer, byteOffset, byteLength)
      this.socket.send(buffer, (err) => (err ? reject(err) : resolve()))
    })
  }

  close() {
    if (this.state === 'CLOSED') return this.closedPromise
    if (this.state === 'CREATED') throw new Error('Cannot close socket before opening')
    this.socket.close()
    return this.closedPromise
  }

  terminate() {
    if (this.state !== 'CLOSED') {
      this.handlers.clear()
      if (this.socket) this.socket.terminate()
      this.state = 'CLOSED'
      this.closedResolve({ code: 1006, reason: 'Abnormal closure via termination' })
    }
  }
}

export function createWsUtils(checkPermission) {
  const sessions = new Map()
  let nextId = 0

  return {
    client(url, options) {
      if (checkPermission) checkPermission('ws.client', url)
      const id = nextId++
      sessions.set(id, new WsSession(url, options))
      return id
    },
    _getSession(id) {
      const session = sessions.get(id)
      if (!session) throw new Error(`Invalid ws session: ${id}`)
      return session
    },
    dispose() {
      for (const session of sessions.values()) session.terminate()
      sessions.clear()
    },
  }
}
