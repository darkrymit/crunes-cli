import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHttpUtils, FetchError } from '../../../src/rune/api/http.js'
import { PermissionError } from '../../../src/rune/permissions/permissions.js'

function makeResponse({ ok = true, status = 200, statusText = 'OK', headers = {}, body = '' } = {}) {
  return {
    ok,
    status,
    statusText,
    headers: new Headers(headers),
    text: vi.fn().mockResolvedValue(body),
  }
}

describe('createHttpUtils', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns ok response with correct fields', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse({ body: 'hello' }))
    const { fetch } = createHttpUtils(null)
    const res = await fetch('https://example.com')
    expect(res.ok).toBe(true)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello')
  })

  it('json() parses response body', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse({ body: '{"key":"val"}' }))
    const { fetch } = createHttpUtils(null)
    const res = await fetch('https://example.com')
    expect(await res.json()).toEqual({ key: 'val' })
  })

  it('headers are returned as a plain object', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse({ headers: { 'content-type': 'text/plain' } }))
    const { fetch } = createHttpUtils(null)
    const res = await fetch('https://example.com')
    expect(res.headers['content-type']).toBe('text/plain')
  })

  it('returns ok: false for non-2xx without throwing', async () => {
    globalThis.fetch.mockResolvedValue(makeResponse({ ok: false, status: 404, statusText: 'Not Found', body: 'nope' }))
    const { fetch } = createHttpUtils(null)
    const res = await fetch('https://example.com')
    expect(res.ok).toBe(false)
    expect(res.status).toBe(404)
  })

  it('throws FetchError on network failure', async () => {
    globalThis.fetch.mockRejectedValue(new TypeError('fetch failed'))
    const { fetch } = createHttpUtils(null)
    await expect(fetch('https://example.com')).rejects.toThrow(FetchError)
  })

  it('throws FetchError on timeout', async () => {
    vi.useFakeTimers()
    globalThis.fetch.mockImplementation((_url, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        )
      })
    )
    const { fetch } = createHttpUtils(null)
    const promise = fetch('https://example.com', { timeout: 100 })
    vi.advanceTimersByTime(101)
    await expect(promise).rejects.toThrow(FetchError)
    vi.useRealTimers()
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
