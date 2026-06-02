import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHttpUtils, FetchError } from '../../../src/rune/api/http.js'
import { PermissionError } from '../../../src/rune/permissions/permissions.js'

function makeResponse({ ok = true, status = 200, statusText = 'OK', headers = {}, body = '' } = {}) {
  const bodyBytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  return {
    ok,
    status,
    statusText,
    headers: new Headers(headers),
    arrayBuffer: vi.fn().mockResolvedValue(bodyBytes.buffer),
    body: { [Symbol.asyncIterator]: async function*() { yield bodyBytes } },
  }
}

describe('createHttpUtils', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns raw response object', async () => {
    const mockRes = makeResponse({ body: 'hello' })
    globalThis.fetch.mockResolvedValue(mockRes)
    const { fetch } = createHttpUtils(null)
    const res = await fetch('https://example.com')
    expect(res.ok).toBe(true)
    expect(res.status).toBe(200)
  })

  it('throws FetchError on network failure', async () => {
    globalThis.fetch.mockRejectedValue(new TypeError('fetch failed'))
    const { fetch } = createHttpUtils(null)
    await expect(fetch('https://example.com')).rejects.toThrow(FetchError)
  })

  it('throws FetchError when signal is already aborted', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    globalThis.fetch.mockImplementation((_url, { signal }) =>
      new Promise((_res, rej) => {
        if (signal && signal.aborted) return rej(new Error('aborted'))
        signal.addEventListener('abort', () => rej(new Error('aborted')))
      })
    )
    const { fetch } = createHttpUtils(null)
    await expect(fetch('https://example.com', { signal: ctrl.signal })).rejects.toThrow(FetchError)
  })

  it('throws FetchError when signal aborts mid-flight', async () => {
    const ctrl = new AbortController()
    globalThis.fetch.mockImplementation((_url, { signal }) =>
      new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))))
    )
    const { fetch } = createHttpUtils(null)
    const promise = fetch('https://example.com', { signal: ctrl.signal })
    ctrl.abort()
    await expect(promise).rejects.toThrow(FetchError)
  })

  it('FetchError carries the original error as cause', async () => {
    const cause = new TypeError('fetch failed')
    globalThis.fetch.mockRejectedValue(cause)
    const { fetch } = createHttpUtils(null)
    let err
    try { await fetch('https://example.com') } catch (e) { err = e }
    expect(err).toBeInstanceOf(FetchError)
    expect(err.cause).toBe(cause)
  })

  it('calls checkPermission with fetch capability and METHOD:url', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse())
    const check = vi.fn()
    const { fetch } = createHttpUtils(check)
    await fetch('https://example.com', { method: 'POST' })
    expect(check).toHaveBeenCalledWith('http.fetch', 'POST:https://example.com')
  })

  it('skips checkPermission when null', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse())
    const { fetch } = createHttpUtils(null)
    await expect(fetch('https://example.com')).resolves.toBeDefined()
  })

  it('propagates PermissionError from checkPermission', async () => {
    const check = () => { throw new PermissionError('http.fetch', 'GET:https://example.com') }
    const { fetch } = createHttpUtils(check)
    await expect(fetch('https://example.com')).rejects.toThrow(PermissionError)
  })

  it('passes method, headers, body to underlying fetch', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse())
    const { fetch } = createHttpUtils(null)
    await fetch('https://example.com', {
      method: 'POST',
      headers: { 'X-Key': 'val' },
      body: 'data',
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ method: 'POST', headers: { 'X-Key': 'val' }, body: 'data' }),
    )
  })

  it('defaults method to GET', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse())
    const { fetch } = createHttpUtils(null)
    await fetch('https://example.com')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('supports multipart upload with ordered array', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse({ body: 'uploaded' }))
    const { fetch } = createHttpUtils(null)
    const arrayBody = [
      { name: 'field1', value: 'hello' },
      { name: 'file1', value: new Uint8Array([1, 2, 3]), filename: 'test.bin', contentType: 'application/octet-stream' }
    ]
    await fetch('https://example.com', { method: 'POST', body: arrayBody })
    expect(globalThis.fetch).toHaveBeenCalled()
    const callArgs = globalThis.fetch.mock.calls[0][1]
    expect(callArgs.body).toBeInstanceOf(globalThis.FormData)
    expect(callArgs.body.get('field1')).toBe('hello')
    const filePart = callArgs.body.get('file1')
    expect(filePart).toBeInstanceOf(globalThis.Blob)
  })
})

describe('createHttpUtils — streaming and new body types', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns raw response (no body consumed)', async () => {
    const mockRes = {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/plain' }),
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('hi').buffer),
      body: { [Symbol.asyncIterator]: async function*() { yield new TextEncoder().encode('hi') } },
    }
    globalThis.fetch.mockResolvedValue(mockRes)
    const { fetch } = createHttpUtils(null)
    const res = await fetch('https://example.com')
    expect(res.arrayBuffer).toBeDefined()
    expect(mockRes.arrayBuffer).not.toHaveBeenCalled()
  })

  it('passes Uint8Array body to underlying fetch', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers(),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      body: { [Symbol.asyncIterator]: async function*() {} },
    })
    const { fetch } = createHttpUtils(null)
    const bytes = new Uint8Array([1, 2, 3])
    await fetch('https://example.com', { method: 'POST', body: bytes })
    const callBody = globalThis.fetch.mock.calls[0][1].body
    expect(callBody).toBeInstanceOf(Uint8Array)
  })
})
