import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { createWsUtils } from '../../../src/rune/api/ws.js'
import { PermissionError } from '../../../src/rune/permissions/permissions.js'
import { runRuneInIsolate } from '../../../src/rune/isolation/runner.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'

function fakeRef(fn) {
  return { apply: (_thisArg, args, _opts) => Promise.resolve().then(() => fn(...args)) }
}

function startEchoServer() {
  return new Promise((resolve) => {
    const httpServer = createServer()
    const wss = new WebSocketServer({ server: httpServer })
    wss.on('connection', (ws) => {
      ws.on('message', (message, isBinary) => {
        if (isBinary) {
          ws.send(message, { binary: true })
        } else {
          ws.send(String(message))
        }
      })
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

  it('sendText() and receive via echo server', async () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    const session = ws._getSession(id)
    const received = []
    session.setHandler('message', fakeRef((msg) => { received.push(msg) }))
    await session.open()
    await session.sendText('hello')
    await new Promise((r) => setTimeout(r, 50))
    expect(received).toEqual(['hello'])
    await session.close()
  })

  it('sendBinary() and receive binary via echo server', async () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    const session = ws._getSession(id)
    const received = []
    session.setHandler('binary', fakeRef((arrayBuffer) => {
      received.push(new Uint8Array(arrayBuffer))
    }))
    await session.open()
    const testArr = new Uint8Array([5, 10, 15])
    await session.sendBinary(testArr.buffer, testArr.byteOffset, testArr.byteLength)
    await new Promise((r) => setTimeout(r, 50))
    expect(received.length).toBe(1)
    expect(Array.from(received[0])).toEqual([5, 10, 15])
    await session.close()
  })

  it('sendText() throws when not OPEN', () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    const session = ws._getSession(id)
    expect(() => session.sendText('msg')).toThrow('Cannot send in state CREATED')
  })

  it('sendBinary() throws when not OPEN', () => {
    const ws = createWsUtils(null)
    const id = ws.client(server.url)
    const session = ws._getSession(id)
    const testArr = new Uint8Array([1, 2])
    expect(() => session.sendBinary(testArr.buffer, 0, 2)).toThrow('Cannot send in state CREATED')
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

describe('WebSocket sandboxed integration', () => {
  let integrationServer
  let tmpDir

  beforeAll(async () => {
    integrationServer = await startEchoServer()
  })

  afterAll(async () => {
    await stopServer(integrationServer)
  })

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(tmpdir(), 'crunes-ws-test-'))
  })

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('successfully executes sandboxed run with sendText and sendBinary in Isolate', async () => {
    const runeFile = path.join(tmpDir, 'test-ws-binary-inline.js')
    const runeSrc = `
      import { ws } from '@utils'
      export async function use() {
        const client = ws.client('ws://localhost:${integrationServer.port}')
        const textPromise = new Promise(resolve => {
          client.on('message', (msg) => resolve(msg))
        })
        const binaryPromise = new Promise(resolve => {
          client.on('binary', (data) => resolve(data))
        })

        await client.open()
        
        await client.sendText('hello sandboxed world')
        const textResult = await textPromise

        const sendArr = new Uint8Array([42, 84, 126])
        await client.sendBinary(sendArr)
        const binaryResult = await binaryPromise

        await client.close()
        
        return {
          textResult,
          binaryIsUint8: binaryResult instanceof Uint8Array,
          binaryBytes: Array.from(binaryResult)
        }
      }
    `
    await fs.writeFile(runeFile, runeSrc, 'utf8')
    const res = await runRuneInIsolate(runeFile, { allow: ['ws.client:**'], deny: [] }, [], tmpDir)
    expect(res).toEqual({
      textResult: 'hello sandboxed world',
      binaryIsUint8: true,
      binaryBytes: [42, 84, 126]
    })
  })
})
