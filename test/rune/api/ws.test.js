import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { createWsUtils } from '../../../src/rune/api/ws.js'
import { PermissionError } from '../../../src/rune/permissions/permissions.js'

function fakeRef(fn) {
  return { apply: (_thisArg, args, _opts) => Promise.resolve().then(() => fn(...args)) }
}

function startEchoServer() {
  return new Promise((resolve) => {
    const httpServer = createServer()
    const wss = new WebSocketServer({ server: httpServer })
    wss.on('connection', (ws) => {
      ws.on('message', (data) => ws.send(String(data)))
    })
    httpServer.listen(0, () => {
      const { port } = httpServer.address()
      resolve({ wss, httpServer, port, url: `ws://localhost:${port}` })
    })
  })
}

function stopServer({ wss, httpServer }) {
  return new Promise((resolve) => {
    wss.close(() => httpServer.close(resolve))
  })
}

describe('createWsUtils', () => {
  let server

  beforeEach(async () => {
    server = await startEchoServer()
  })

  afterEach(async () => {
    await stopServer(server)
  })

  it('client returns an integer session ID', () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    expect(typeof id).toBe('number')
  })

  it('_getSession returns the session for a valid ID', () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    expect(ws._getSession(id)).toBeDefined()
  })

  it('_getSession throws for an invalid ID', () => {
    const ws = createWsUtils(null)
    expect(() => ws._getSession(99)).toThrow('Invalid ws session: 99')
  })

  it('client calls checkPermission with ws.client capability and URL', () => {
    const calls = []
    const check = (cap, val) => calls.push({ cap, val })
    const ws = createWsUtils(check)
    ws.client(server.url)
    expect(calls).toEqual([{ cap: 'ws.client', val: server.url }])
  })

  it('client propagates PermissionError from checkPermission', () => {
    const check = () => { throw new PermissionError('ws.client', server.url) }
    const ws = createWsUtils(check)
    expect(() => ws.client(server.url)).toThrow(PermissionError)
  })

  it('open() connects and resolves', async () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    const session = ws._getSession(id)
    await expect(session.open()).resolves.toBeUndefined()
    await session.close()
  })

  it('open() rejects on invalid URL', async () => {
    const ws = createWsUtils(null)
    const id = ws.client('ws://localhost:1')
    const session = ws._getSession(id)
    await expect(session.open()).rejects.toThrow()
  })

  it('open() throws if called on an already-open socket', async () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    const session = ws._getSession(id)
    await session.open()
    expect(() => session.open()).toThrow('Cannot open socket in state OPEN')
    await session.close()
  })

  it('send() and receive via echo server', async () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    const session = ws._getSession(id)
    const received = []
    session.setHandler('message', fakeRef((msg) => { received.push(msg) }))
    await session.open()
    await session.send('hello')
    await new Promise((r) => setTimeout(r, 50))
    expect(received).toEqual(['hello'])
    await session.close()
  })

  it('send() throws when not OPEN', () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    const session = ws._getSession(id)
    expect(() => session.send('msg')).toThrow('Cannot send in state CREATED')
  })

  it('close() is idempotent — repeated calls return the same promise', async () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    const session = ws._getSession(id)
    await session.open()
    const p1 = session.close()
    const p2 = session.close()
    expect(p1).toBe(p2)
    await p1
  })

  it('close() throws when called before open()', () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    const session = ws._getSession(id)
    expect(() => session.close()).toThrow('Cannot close socket before opening')
  })

  it('on(open) handler is called after successful open', async () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    const session = ws._getSession(id)
    let opened = false
    session.setHandler('open', fakeRef(() => { opened = true }))
    await session.open()
    expect(opened).toBe(true)
    await session.close()
  })

  it('on(close) handler is called after close', async () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    const session = ws._getSession(id)
    let closed = false
    session.setHandler('close', fakeRef(() => { closed = true }))
    await session.open()
    await session.close()
    expect(closed).toBe(true)
  })

  it('dispose() terminates all open sessions', async () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    const session = ws._getSession(id)
    await session.open()
    ws.dispose()
    expect(session.state).toBe('CLOSED')
  })

  it('dispose() is safe to call when no sessions exist', () => {
    const ws = createWsUtils(null)
    expect(() => ws.dispose()).not.toThrow()
  })
})
