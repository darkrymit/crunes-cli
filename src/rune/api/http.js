import { createServer } from 'node:http'

export class FetchError extends Error {
  constructor(message, { cause } = {}) {
    super(message)
    this.name = 'FetchError'
    if (cause !== undefined) this.cause = cause
  }
}

class HttpServerSession {
  constructor(port, host) {
    this.port = port
    this.host = host
    this._handler = null
    this._server = null
    this._state = 'CREATED'
    this._closedResolve = null
    this._closedPromise = new Promise(r => { this._closedResolve = r })
    this._reqIdCounter = 0
    this._requestAborts = new Map()
  }

  getRequestAbort(reqId) {
    return this._requestAborts.get(reqId)
  }

  setHandler(handlerRef) {
    this._handler = handlerRef
  }

  async open() {
    if (this._state !== 'CREATED') throw new Error(`HTTP server already open`)
    return new Promise((resolve, reject) => {
      this._server = createServer(async (req, res) => {
        try {
          const url = new URL(req.url, `http://${req.headers.host ?? this.host}`)
          const headers = {}
          for (let i = 0; i < req.rawHeaders.length; i += 2) {
            headers[req.rawHeaders[i].toLowerCase()] = req.rawHeaders[i + 1]
          }
          const bodyChunks = []
          for await (const chunk of req) bodyChunks.push(chunk)
          const bodyBuffer = Buffer.concat(bodyChunks)

          const reqId = this._reqIdCounter++
          const abort = new AbortController()
          this._requestAborts.set(reqId, abort)
          res.on('close', () => {
            abort.abort()
            this._requestAborts.delete(reqId)
          })

          const meta = {
            method: req.method,
            url: url.href,
            pathname: url.pathname,
            searchParams: Object.fromEntries(url.searchParams),
            headers,
            body: bodyBuffer.length > 0
              ? bodyBuffer.buffer.slice(bodyBuffer.byteOffset, bodyBuffer.byteOffset + bodyBuffer.byteLength)
              : null,
            reqId,
          }

          const result = await this._handler.apply(undefined, [meta], {
            arguments: { copy: true },
            result: { promise: true, copy: true },
          })

          res.writeHead(result.status ?? 200, result.statusText ?? '', result.headers ?? {})

          if (result.body != null) {
            res.end(Buffer.from(result.body))
          } else {
            res.end()
          }
        } catch (err) {
          if (!res.headersSent) res.writeHead(500)
          res.end(err.message)
        }
      })

      this._server.on('error', reject)
      this._server.listen(this.port, this.host, () => {
        this.port = this._server.address().port
        this._state = 'OPEN'
        this._server.removeListener('error', reject)
        resolve()
      })

      this._server.on('close', () => {
        this._state = 'CLOSED'
        this._closedResolve()
      })
    })
  }

  close() {
    if (this._state === 'CLOSED') return this._closedPromise
    if (this._state === 'CREATED') {
      this._state = 'CLOSED'
      this._closedResolve()
      return this._closedPromise
    }
    return new Promise((resolve, reject) => {
      this._server.close((err) => err ? reject(err) : resolve())
    }).then(() => this._closedPromise)
  }

  closed() {
    return this._closedPromise
  }
}

export function createHttpUtils(checkPermission) {
  async function fetch(url, { method = 'GET', headers = {}, body, signal, ...rest } = {}) {
    if (checkPermission) checkPermission('http.fetch', `${method}:${url}`)

    let finalBody = body
    if (Array.isArray(body)) {
      const fd = new globalThis.FormData()
      for (const entry of body) {
        const { name, value, filename, contentType } = entry
        let val
        if (value instanceof globalThis.Blob) {
          val = value
        } else if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
          const typeOpt = contentType ? { type: contentType } : {}
          val = new globalThis.Blob([value], typeOpt)
        } else {
          val = typeof value === 'string' ? value : String(value)
        }
        if (filename) {
          fd.append(name, val, filename)
        } else {
          fd.append(name, val)
        }
      }
      finalBody = fd
    }

    try {
      const res = await globalThis.fetch(url, { method, headers, body: finalBody, signal: signal ?? null, ...rest })
      return res
    } catch (err) {
      throw new FetchError(err.message, { cause: err })
    }
  }

  const serverSessions = new Map()
  let nextServerId = 0

  return {
    fetch,
    server(port, opts = {}) {
      const host = opts.host ?? '127.0.0.1'
      if (checkPermission) checkPermission('http.server', `${host}:${port}`)
      const id = nextServerId++
      serverSessions.set(id, new HttpServerSession(port, host))
      return id
    },
    _getServerSession(id) {
      const s = serverSessions.get(id)
      if (!s) throw new Error(`Invalid http server session: ${id}`)
      return s
    },
    disposeServers() {
      for (const s of serverSessions.values()) s.close().catch(() => {})
      serverSessions.clear()
    },
  }
}
