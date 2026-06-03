import { describe, it, expect, afterEach } from 'vitest'
import { createWsUtils } from '../../../src/rune/api/ws.js'
import { createHttpUtils } from '../../../src/rune/api/http.js'
import { PermissionError } from '../../../src/rune/permissions/permissions.js'
import WebSocket from 'ws'

function fakeRef(fn) {
  return { apply: (_t, args, _o) => Promise.resolve().then(() => fn(...args)) }
}

const openedServers = []
afterEach(async () => {
  for (const s of openedServers) { try { await s.close() } catch {} }
  openedServers.length = 0
})

describe('createWsUtils — server', () => {
  it('server() returns a numeric id', () => {
    const ws = createWsUtils(null)
    const id = ws.server(0)
    expect(typeof id).toBe('number')
  })

  it('server() calls checkPermission with ws.server capability', () => {
    const calls = []
    const ws = createWsUtils((cap, val) => calls.push({ cap, val }))
    ws.server(8080, { host: '0.0.0.0' })
    expect(calls).toEqual([{ cap: 'ws.server', val: '0.0.0.0:8080' }])
  })

  it('server() with path includes path in permission value', () => {
    const calls = []
    const ws = createWsUtils((cap, val) => calls.push({ cap, val }))
    ws.server(8080, { host: '0.0.0.0', path: '/chat' })
    expect(calls).toEqual([{ cap: 'ws.server', val: '0.0.0.0:8080:/chat' }])
  })

  it('server() propagates PermissionError', () => {
    const ws = createWsUtils(() => { throw new PermissionError('ws.server', '0.0.0.0:8080') })
    expect(() => ws.server(8080, { host: '0.0.0.0' })).toThrow(PermissionError)
  })

  it('open() binds port and accepts connections', async () => {
    const ws = createWsUtils(null)
    const id = ws.server(0)
    const session = ws._getWsServerSession(id)
    openedServers.push(session)
    await session.open()
    expect(session.port).toBeGreaterThan(0)
    const client = new WebSocket(`ws://127.0.0.1:${session.port}`)
    await new Promise((res, rej) => { client.on('open', res); client.on('error', rej) })
    client.close()
  })

  it('connection handler receives connId and can register message handler', async () => {
    const ws = createWsUtils(null)
    const id = ws.server(0)
    const session = ws._getWsServerSession(id)
    openedServers.push(session)
    const received = []
    session.setConnectionHandler(fakeRef(async (connId) => {
      const conn = ws._getWsServerConn(connId)
      conn.setHandler('message', fakeRef((msg) => { received.push(msg) }))
    }))
    await session.open()
    const client = new WebSocket(`ws://127.0.0.1:${session.port}`)
    await new Promise((res, rej) => { client.on('open', res); client.on('error', rej) })
    client.send('hello server')
    await new Promise(r => setTimeout(r, 50))
    expect(received).toEqual(['hello server'])
    client.close()
  })

  it('connection handler passes url to WsServerConnSession', async () => {
    const wsUtils = createWsUtils(null)
    const id = wsUtils.server(0)
    const session = wsUtils._getWsServerSession(id)
    openedServers.push(session)
    let capturedConn = null
    session.setConnectionHandler(fakeRef(async (connId) => {
      capturedConn = wsUtils._getWsServerConn(connId)
    }))
    await session.open()
    const port = session.port
    const client = new WebSocket(`ws://127.0.0.1:${port}/chat/room1`)
    await new Promise((res, rej) => { client.on('open', res); client.on('error', rej) })
    await new Promise(r => setTimeout(r, 20))
    expect(capturedConn.url).toBe(`ws://127.0.0.1:${port}/chat/room1`)
    expect(capturedConn.pathname).toBe('/chat/room1')
    expect(capturedConn.search).toBe('')
    client.close()
  })

  it('connection handler captures search string from upgrade URL', async () => {
    const wsUtils = createWsUtils(null)
    const id = wsUtils.server(0)
    const session = wsUtils._getWsServerSession(id)
    openedServers.push(session)
    let capturedConn = null
    session.setConnectionHandler(fakeRef(async (connId) => {
      capturedConn = wsUtils._getWsServerConn(connId)
    }))
    await session.open()
    const port = session.port
    const client = new WebSocket(`ws://127.0.0.1:${port}/logs/abc123?foo=bar`)
    await new Promise((res, rej) => { client.on('open', res); client.on('error', rej) })
    await new Promise(r => setTimeout(r, 20))
    expect(capturedConn.pathname).toBe('/logs/abc123')
    expect(capturedConn.search).toBe('?foo=bar')
    client.close()
  })

  it('connection handler captures headers from upgrade request', async () => {
    const wsUtils = createWsUtils(null)
    const id = wsUtils.server(0)
    const session = wsUtils._getWsServerSession(id)
    openedServers.push(session)
    let capturedConn = null
    session.setConnectionHandler(fakeRef(async (connId) => {
      capturedConn = wsUtils._getWsServerConn(connId)
    }))
    await session.open()
    const port = session.port
    const client = new WebSocket(`ws://127.0.0.1:${port}/`, { headers: { 'x-custom': 'test-value' } })
    await new Promise((res, rej) => { client.on('open', res); client.on('error', rej) })
    await new Promise(r => setTimeout(r, 20))
    const headers = JSON.parse(capturedConn.headersJson)
    expect(headers['x-custom']).toBe('test-value')
    client.close()
  })

  it('connection handler invocation passes url, pathname, search, headersJson as args', async () => {
    const wsUtils = createWsUtils(null)
    const id = wsUtils.server(0)
    const session = wsUtils._getWsServerSession(id)
    openedServers.push(session)
    const received = []
    session.setConnectionHandler(fakeRef(async (connId, url, pathname, search, headersJson) => {
      received.push({ connId, url, pathname, search, headersJson })
    }))
    await session.open()
    const port = session.port
    const client = new WebSocket(`ws://127.0.0.1:${port}/api/v2?token=xyz`, {
      headers: { 'x-request-id': 'abc' }
    })
    await new Promise((res, rej) => { client.on('open', res); client.on('error', rej) })
    await new Promise(r => setTimeout(r, 20))
    expect(received).toHaveLength(1)
    expect(received[0].url).toBe(`ws://127.0.0.1:${port}/api/v2?token=xyz`)
    expect(received[0].pathname).toBe('/api/v2')
    expect(received[0].search).toBe('?token=xyz')
    const hdrs = JSON.parse(received[0].headersJson)
    expect(hdrs['x-request-id']).toBe('abc')
    client.close()
  })

  it('dispose() closes all ws servers', async () => {
    const ws = createWsUtils(null)
    const id = ws.server(0)
    const session = ws._getWsServerSession(id)
    await session.open()
    const port = session.port
    ws.dispose()
    await new Promise(r => setTimeout(r, 50))
    await expect(new Promise((res, rej) => {
      const c = new WebSocket(`ws://127.0.0.1:${port}`)
      c.on('open', res); c.on('error', rej)
    })).rejects.toThrow()
  })

  it('piggyback on HttpServerSession shares port', async () => {
    const http = createHttpUtils(null)
    const httpId = http.server(0)
    const httpSession = http._getServerSession(httpId)
    openedServers.push(httpSession)

    const ws = createWsUtils(null)
    const wsId = ws.server(httpSession)
    const wsSession = ws._getWsServerSession(wsId)

    await httpSession.open()
    await wsSession.open()
    openedServers.push(wsSession)

    expect(wsSession.port).toBe(httpSession.port)
    const client = new WebSocket(`ws://127.0.0.1:${wsSession.port}`)
    await new Promise((res, rej) => { client.on('open', res); client.on('error', rej) })
    client.close()
  })
})

describe('createWsUtils — path routing', () => {
  it('named param extracted from pathname', async () => {
    const http = createHttpUtils(null)
    const httpId = http.server(0)
    const httpSession = http._getServerSession(httpId)
    openedServers.push(httpSession)
    await httpSession.open()

    const ws = createWsUtils(null)
    const wsId = ws.server(httpSession, { path: '/logs/:jobId' })
    const session = ws._getWsServerSession(wsId)
    openedServers.push(session)

    let capturedParams = null
    session.setConnectionHandler(fakeRef(async (connId, url, pathname, search, headersJson, pathParamsJson) => {
      capturedParams = JSON.parse(pathParamsJson)
    }))
    await session.open()

    const client = new WebSocket(`ws://127.0.0.1:${httpSession.port}/logs/abc123`)
    await new Promise((res, rej) => { client.on('open', res); client.on('error', rej) })
    await new Promise(r => setTimeout(r, 20))
    expect(capturedParams).toEqual({ jobId: 'abc123' })
    client.close()
  })

  it('specificity: literal segment beats named param', async () => {
    const http = createHttpUtils(null)
    const httpId = http.server(0)
    const httpSession = http._getServerSession(httpId)
    openedServers.push(httpSession)
    await httpSession.open()

    const ws = createWsUtils(null)

    const paramId = ws.server(httpSession, { path: '/logs/:jobId' })
    const paramSession = ws._getWsServerSession(paramId)
    openedServers.push(paramSession)

    const literalId = ws.server(httpSession, { path: '/logs/special' })
    const literalSession = ws._getWsServerSession(literalId)
    openedServers.push(literalSession)

    const hits = { param: 0, literal: 0 }
    paramSession.setConnectionHandler(fakeRef(async () => { hits.param++ }))
    literalSession.setConnectionHandler(fakeRef(async () => { hits.literal++ }))

    await paramSession.open()
    await literalSession.open()

    const c1 = new WebSocket(`ws://127.0.0.1:${httpSession.port}/logs/special`)
    await new Promise((res, rej) => { c1.on('open', res); c1.on('error', rej) })
    await new Promise(r => setTimeout(r, 20))
    c1.close()

    expect(hits).toEqual({ param: 0, literal: 1 })
  })

  it('specificity: param session catches non-literal paths', async () => {
    const http = createHttpUtils(null)
    const httpId = http.server(0)
    const httpSession = http._getServerSession(httpId)
    openedServers.push(httpSession)
    await httpSession.open()

    const ws = createWsUtils(null)

    const paramId = ws.server(httpSession, { path: '/logs/:jobId' })
    const paramSession = ws._getWsServerSession(paramId)
    openedServers.push(paramSession)

    const literalId = ws.server(httpSession, { path: '/logs/special' })
    const literalSession = ws._getWsServerSession(literalId)
    openedServers.push(literalSession)

    const hits = { param: 0, literal: 0 }
    paramSession.setConnectionHandler(fakeRef(async () => { hits.param++ }))
    literalSession.setConnectionHandler(fakeRef(async () => { hits.literal++ }))

    await paramSession.open()
    await literalSession.open()

    const c2 = new WebSocket(`ws://127.0.0.1:${httpSession.port}/logs/other`)
    await new Promise((res, rej) => { c2.on('open', res); c2.on('error', rej) })
    await new Promise(r => setTimeout(r, 20))
    c2.close()

    expect(hits).toEqual({ param: 1, literal: 0 })
  })

  it('catch-all (no path) receives unmatched connections', async () => {
    const http = createHttpUtils(null)
    const httpId = http.server(0)
    const httpSession = http._getServerSession(httpId)
    openedServers.push(httpSession)
    await httpSession.open()

    const ws = createWsUtils(null)

    const catchAllId = ws.server(httpSession)
    const catchAllSession = ws._getWsServerSession(catchAllId)
    openedServers.push(catchAllSession)

    let connected = false
    catchAllSession.setConnectionHandler(fakeRef(async () => { connected = true }))
    await catchAllSession.open()

    const client = new WebSocket(`ws://127.0.0.1:${httpSession.port}/anything/goes`)
    await new Promise((res, rej) => { client.on('open', res); client.on('error', rej) })
    await new Promise(r => setTimeout(r, 20))
    expect(connected).toBe(true)
    client.close()
  })

  it('404 when no session matches upgrade path', async () => {
    const http = createHttpUtils(null)
    const httpId = http.server(0)
    const httpSession = http._getServerSession(httpId)
    openedServers.push(httpSession)
    await httpSession.open()

    const ws = createWsUtils(null)
    const wsId = ws.server(httpSession, { path: '/jobs' })
    const session = ws._getWsServerSession(wsId)
    openedServers.push(session)
    session.setConnectionHandler(fakeRef(async () => {}))
    await session.open()

    await expect(new Promise((res, rej) => {
      const c = new WebSocket(`ws://127.0.0.1:${httpSession.port}/unregistered`)
      c.on('open', res)
      c.on('error', rej)
    })).rejects.toThrow()
  })

  it('empty pathParams when path has no named segments', async () => {
    const http = createHttpUtils(null)
    const httpId = http.server(0)
    const httpSession = http._getServerSession(httpId)
    openedServers.push(httpSession)
    await httpSession.open()

    const ws = createWsUtils(null)
    const wsId = ws.server(httpSession, { path: '/jobs' })
    const session = ws._getWsServerSession(wsId)
    openedServers.push(session)

    let capturedParams = null
    session.setConnectionHandler(fakeRef(async (connId, url, pathname, search, headersJson, pathParamsJson) => {
      capturedParams = JSON.parse(pathParamsJson)
    }))
    await session.open()

    const client = new WebSocket(`ws://127.0.0.1:${httpSession.port}/jobs`)
    await new Promise((res, rej) => { client.on('open', res); client.on('error', rej) })
    await new Promise(r => setTimeout(r, 20))
    expect(capturedParams).toEqual({})
    client.close()
  })

  it('standalone server with named param extracts pathParams', async () => {
    const ws = createWsUtils(null)
    const wsId = ws.server(0, { path: '/logs/:jobId' })
    const session = ws._getWsServerSession(wsId)
    openedServers.push(session)

    let capturedParams = null
    session.setConnectionHandler(fakeRef(async (connId, url, pathname, search, headersJson, pathParamsJson) => {
      capturedParams = JSON.parse(pathParamsJson)
    }))
    await session.open()

    const client = new WebSocket(`ws://127.0.0.1:${session.port}/logs/xyz789`)
    await new Promise((res, rej) => { client.on('open', res); client.on('error', rej) })
    await new Promise(r => setTimeout(r, 20))
    expect(capturedParams).toEqual({ jobId: 'xyz789' })
    client.close()
  })

  it('multiple named params all extracted', async () => {
    const http = createHttpUtils(null)
    const httpId = http.server(0)
    const httpSession = http._getServerSession(httpId)
    openedServers.push(httpSession)
    await httpSession.open()

    const ws = createWsUtils(null)
    const wsId = ws.server(httpSession, { path: '/a/:x/b/:y' })
    const session = ws._getWsServerSession(wsId)
    openedServers.push(session)

    let capturedParams = null
    session.setConnectionHandler(fakeRef(async (connId, url, pathname, search, headersJson, pathParamsJson) => {
      capturedParams = JSON.parse(pathParamsJson)
    }))
    await session.open()

    const client = new WebSocket(`ws://127.0.0.1:${httpSession.port}/a/hello/b/world`)
    await new Promise((res, rej) => { client.on('open', res); client.on('error', rej) })
    await new Promise(r => setTimeout(r, 20))
    expect(capturedParams).toEqual({ x: 'hello', y: 'world' })
    client.close()
  })
})

describe('createWsUtils — session lifecycle fixes', () => {
  it('close() resolves closed() on standalone server (bug #1)', async () => {
    const ws = createWsUtils(null)
    const id = ws.server(0)
    const session = ws._getWsServerSession(id)
    await session.open()
    await session.close()
    await expect(session.closed()).resolves.toBeUndefined()
  })

  it('close() resolves closed() on piggybacked server (bug #1)', async () => {
    const http = createHttpUtils(null)
    const httpId = http.server(0)
    const httpSession = http._getServerSession(httpId)
    await httpSession.open()

    const ws = createWsUtils(null)
    const wsId = ws.server(httpSession)
    const session = ws._getWsServerSession(wsId)
    await session.open()
    await session.close()
    await expect(session.closed()).resolves.toBeUndefined()
  })

  it('wsSession.open() before httpSession.open() still accepts connections (bug #2)', async () => {
    const http = createHttpUtils(null)
    const httpId = http.server(0)
    const httpSession = http._getServerSession(httpId)

    const ws = createWsUtils(null)
    const wsId = ws.server(httpSession)
    const session = ws._getWsServerSession(wsId)
    openedServers.push(session)

    // WS opens BEFORE HTTP — this is the bug scenario
    await session.open()
    await httpSession.open()
    openedServers.push(httpSession)

    let connected = false
    session.setConnectionHandler(fakeRef(async () => { connected = true }))

    const client = new WebSocket(`ws://127.0.0.1:${httpSession.port}`)
    await new Promise((res, rej) => { client.on('open', res); client.on('error', rej) })
    await new Promise(r => setTimeout(r, 20))
    expect(connected).toBe(true)
    client.close()
  })

  it('close() before open() resolves cleanly without throwing (bug #5)', async () => {
    const ws = createWsUtils(null)
    const id = ws.server(0)
    const session = ws._getWsServerSession(id)
    // Never called open() — calling close() in CREATED state
    await expect(session.close()).resolves.toBeUndefined()
    await expect(session.closed()).resolves.toBeUndefined()
  })
})
