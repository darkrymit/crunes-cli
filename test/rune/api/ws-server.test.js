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
