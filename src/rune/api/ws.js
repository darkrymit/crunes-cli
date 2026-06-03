import { WebSocket, WebSocketServer } from 'ws'

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
          if (h) await h.apply(undefined, [String(data)], { result: { promise: true } }).catch(() => {})
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

class WsServerConnSession {
  constructor(socket, id, url, pathname, search, headersJson) {
    this.id = id
    this.url = url
    this.pathname = pathname
    this.search = search
    this.headersJson = headersJson
    this._socket = socket
    this.handlers = new Map()
    this._closedResolve = null
    this._closedPromise = new Promise(r => { this._closedResolve = r })
    this._abort = new AbortController()
    this.signal = this._abort.signal

    socket.on('message', async (data, isBinary) => {
      if (isBinary) {
        const h = this.handlers.get('binary')
        if (h) {
          const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
          await h.apply(undefined, [ab], { arguments: { copy: true }, result: { promise: true } }).catch(() => {})
        }
      } else {
        const h = this.handlers.get('message')
        if (h) await h.apply(undefined, [String(data)], { result: { promise: true } }).catch(() => {})
      }
    })

    socket.on('close', async (code, reason) => {
      const reasonStr = reason ? String(reason) : ''
      this._abort.abort()
      const h = this.handlers.get('close')
      if (h) await h.apply(undefined, [code, reasonStr], { result: { promise: true } }).catch(() => {})
      this._closedResolve({ code, reason: reasonStr })
    })

    socket.on('error', async (err) => {
      const h = this.handlers.get('error')
      if (h) {
        const errData = JSON.stringify({ message: err.message, code: err.code ?? null })
        await h.apply(undefined, [errData], { result: { promise: true } }).catch(() => {})
      }
    })
  }

  setHandler(event, callbackRef) {
    this.handlers.set(event, callbackRef)
  }

  sendText(message) {
    return new Promise((resolve, reject) => {
      this._socket.send(message, (err) => err ? reject(err) : resolve())
    })
  }

  sendBinary(arrayBuffer, byteOffset, byteLength) {
    return new Promise((resolve, reject) => {
      const buffer = Buffer.from(arrayBuffer, byteOffset, byteLength)
      this._socket.send(buffer, { binary: true }, (err) => err ? reject(err) : resolve())
    })
  }

  close(code, reason) {
    this._socket.close(code ?? 1000, reason ?? '')
    return this._closedPromise
  }

  closed() {
    return this._closedPromise
  }

  terminate() {
    this._socket.terminate()
  }
}

class WsServerSession {
  constructor(portOrHttpSession, opts = {}) {
    this._httpSession = typeof portOrHttpSession === 'object' && portOrHttpSession !== null
      ? portOrHttpSession
      : null
    this._port = typeof portOrHttpSession === 'number' ? portOrHttpSession : 0
    this._host = opts.host ?? '127.0.0.1'
    this._path = opts.path ?? null
    this._wss = null
    this._state = 'CREATED'
    this._connectionHandler = null
    this._errorHandler = null
    this._connSessions = new Map()
    this._closedResolve = null
    this._closedPromise = new Promise(r => { this._closedResolve = r })
    this._connIdCounter = 0
  }

  get port() {
    if (this._httpSession) return this._httpSession.port
    return this._port
  }

  setConnectionHandler(handlerRef) {
    this._connectionHandler = handlerRef
  }

  setErrorHandler(handlerRef) {
    this._errorHandler = handlerRef
  }

  open() {
    if (this._state !== 'CREATED') return Promise.reject(new Error('WS server already open'))
    return new Promise((resolve, reject) => {
      const wssOpts = this._httpSession
        ? { server: this._httpSession._server, ...(this._path ? { path: this._path } : {}) }
        : { port: this._port, host: this._host, ...(this._path ? { path: this._path } : {}) }

      this._wss = new WebSocketServer(wssOpts)

      this._wss.on('error', (err) => {
        if (this._state === 'CREATED') {
          reject(err)
        } else if (this._errorHandler) {
          const errData = JSON.stringify({ message: err.message, code: err.code ?? null })
          this._errorHandler.apply(undefined, [errData], { result: { promise: true } }).catch(() => {})
        }
      })

      this._wss.on('listening', () => {
        if (!this._httpSession) {
          this._port = this._wss.address().port
        }
        this._state = 'OPEN'
        resolve()
      })

      this._wss.on('connection', async (socket, request) => {
        const port     = this._httpSession ? this._httpSession._server.address().port : this._wss.address().port
        const host     = this._httpSession ? this._httpSession.host : this._host
        const parsed   = new URL(request.url, `ws://${host}:${port}`)
        const url      = parsed.href
        const pathname = parsed.pathname
        const search   = parsed.search
        const headersJson = JSON.stringify(Object.fromEntries(Object.entries(request.headers)))
        const connId = String(this._connIdCounter++)
        const conn   = new WsServerConnSession(socket, connId, url, pathname, search, headersJson)
        this._connSessions.set(connId, conn)
        socket.on('close', () => this._connSessions.delete(connId))
        if (this._connectionHandler) {
          await this._connectionHandler.apply(undefined, [connId, url, pathname, search, headersJson], { result: { promise: true } }).catch(() => {})
        }
      })

      this._wss.on('close', () => {
        this._state = 'CLOSED'
        this._closedResolve()
      })

      // When piggybacking, WebSocketServer on an already-listening http.Server
      // won't emit 'listening'. Resolve immediately.
      if (this._httpSession && this._httpSession._state === 'OPEN') {
        this._state = 'OPEN'
        resolve()
      }
    })
  }

  getConn(connId) {
    const conn = this._connSessions.get(connId)
    if (!conn) throw new Error(`Invalid ws server connection: ${connId}`)
    return conn
  }

  close() {
    if (this._state === 'CLOSED') return this._closedPromise
    return new Promise((resolve, reject) => {
      for (const conn of this._connSessions.values()) conn.terminate()
      this._wss.close((err) => err ? reject(err) : resolve())
    })
  }

  closed() {
    return this._closedPromise
  }

  terminate() {
    if (this._state !== 'CLOSED') {
      for (const conn of this._connSessions.values()) conn.terminate()
      if (this._wss) this._wss.close(() => {})
      this._state = 'CLOSED'
      this._closedResolve()
    }
  }
}

export function createWsUtils(checkPermission) {
  const sessions = new Map()
  let nextId = 0

  const wsServerSessions = new Map()
  let nextWsServerId = 0

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
    server(portOrHttpSession, opts = {}) {
      const isHttpSession = typeof portOrHttpSession === 'object' && portOrHttpSession !== null
      const host = opts.host ?? '127.0.0.1'
      const path = opts.path ?? null
      if (isHttpSession) {
        const h = portOrHttpSession.host
        const p = portOrHttpSession.port
        const permValue = path ? `${h}:${p}:${path}` : `${h}:${p}`
        if (checkPermission) checkPermission('ws.server', permValue)
      } else {
        const permValue = path ? `${host}:${portOrHttpSession}:${path}` : `${host}:${portOrHttpSession}`
        if (checkPermission) checkPermission('ws.server', permValue)
      }
      const id = nextWsServerId++
      wsServerSessions.set(id, new WsServerSession(portOrHttpSession, opts))
      return id
    },
    _getWsServerSession(id) {
      const s = wsServerSessions.get(id)
      if (!s) throw new Error(`Invalid ws server session: ${id}`)
      return s
    },
    _getWsServerConn(connId) {
      for (const session of wsServerSessions.values()) {
        const conn = session._connSessions.get(connId)
        if (conn) return conn
      }
      throw new Error(`Invalid ws server connection: ${connId}`)
    },
    dispose() {
      for (const session of sessions.values()) session.terminate()
      sessions.clear()
      for (const session of wsServerSessions.values()) session.terminate()
      wsServerSessions.clear()
    },
  }
}
