import { describe, it, expect, afterEach } from 'vitest'
import { createHttpUtils } from '../../../src/rune/api/http.js'
import { PermissionError } from '../../../src/rune/permissions/permissions.js'

function fakeRef(fn) {
  return { apply: (_t, args, _o) => Promise.resolve().then(() => fn(...args)) }
}

let openedServers = []

afterEach(async () => {
  for (const s of openedServers) {
    try { await s.close() } catch {}
  }
  openedServers = []
})

describe('createHttpUtils — server', () => {
  it('server() returns a handle with an id', () => {
    const http = createHttpUtils(null)
    const id = http.server(0)
    expect(typeof id).toBe('number')
  })

  it('server() calls checkPermission with http.server capability', () => {
    const calls = []
    const http = createHttpUtils((cap, val) => calls.push({ cap, val }))
    http.server(3000, { host: '0.0.0.0' })
    expect(calls).toEqual([{ cap: 'http.server', val: '0.0.0.0:3000' }])
  })

  it('server() propagates PermissionError', () => {
    const http = createHttpUtils(() => { throw new PermissionError('http.server', '0.0.0.0:3000') })
    expect(() => http.server(3000, { host: '0.0.0.0' })).toThrow(PermissionError)
  })

  it('open() binds and server.port is set', async () => {
    const http = createHttpUtils(null)
    const id = http.server(0)
    const session = http._getServerSession(id)
    openedServers.push(session)
    await session.open()
    expect(session.port).toBeGreaterThan(0)
  })

  it('open() rejects when called twice', async () => {
    const http = createHttpUtils(null)
    const id = http.server(0)
    const session = http._getServerSession(id)
    openedServers.push(session)
    await session.open()
    await expect(session.open()).rejects.toThrow('already open')
  })

  it('request handler is called and receives method + pathname', async () => {
    const http = createHttpUtils(null)
    const id = http.server(0)
    const session = http._getServerSession(id)
    openedServers.push(session)
    const received = []
    session.setHandler(fakeRef(async (meta) => {
      received.push({ method: meta.method, pathname: meta.pathname })
      return { status: 200, statusText: 'OK', headers: {}, body: null }
    }))
    await session.open()
    const res = await fetch(`http://127.0.0.1:${session.port}/test`)
    expect(res.status).toBe(200)
    expect(received[0]).toMatchObject({ method: 'GET', pathname: '/test' })
  })

  it('close() stops accepting connections', async () => {
    const http = createHttpUtils(null)
    const id = http.server(0)
    const session = http._getServerSession(id)
    await session.open()
    const port = session.port
    await session.close()
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow()
  })

  it('disposeServers() closes all open servers', async () => {
    const http = createHttpUtils(null)
    const id = http.server(0)
    const session = http._getServerSession(id)
    await session.open()
    const port = session.port
    http.disposeServers()
    await new Promise(r => setTimeout(r, 50))
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow()
  })
})
