import { WebSocket } from 'ws'

class WsSession {
  constructor(url, options) {
    this.url = url
    this.options = options ?? {}
    this.state = 'CREATED'
    this.socket = null
    this.handlers = new Map()
    this.closePromise = null
    this.closeResolve = null
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
        if (h) h.apply(undefined, [JSON.stringify({ message: err.message })], { result: { promise: true } }).catch(() => {})
      })

      socket.on('message', async (data) => {
        const h = this.handlers.get('message')
        if (h) await h.apply(undefined, [String(data)], { result: { promise: true } })
      })

      socket.on('close', async () => {
        this.state = 'CLOSED'
        const h = this.handlers.get('close')
        if (h) await h.apply(undefined, [], { result: { promise: true } }).catch(() => {})
        if (this.closeResolve) { this.closeResolve(); this.closeResolve = null }
      })
    })
  }

  send(message) {
    if (this.state !== 'OPEN') throw new Error(`Cannot send in state ${this.state}`)
    return new Promise((resolve, reject) => {
      this.socket.send(message, (err) => (err ? reject(err) : resolve()))
    })
  }

  close() {
    if (this.state === 'CLOSED') return Promise.resolve()
    if (this.closePromise) return this.closePromise
    if (this.state === 'CREATED') throw new Error('Cannot close socket before opening')
    this.closePromise = new Promise((resolve) => { this.closeResolve = resolve })
    this.socket.close()
    return this.closePromise
  }

  terminate() {
    if (this.state !== 'CLOSED') {
      this.handlers.clear()
      if (this.socket) this.socket.terminate()
      this.state = 'CLOSED'
      if (this.closeResolve) { this.closeResolve(); this.closeResolve = null }
    }
  }
}

export function createWsUtils(checkPermission) {
  const sessions = new Map()
  let nextId = 0

  return {
    createSession(url, options) {
      if (checkPermission) checkPermission('ws', url)
      const id = nextId++
      sessions.set(id, new WsSession(url, options))
      return id
    },
    getSession(id) {
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
