export class FetchError extends Error {
  constructor(message, { cause } = {}) {
    super(message)
    this.name = 'FetchError'
    if (cause !== undefined) this.cause = cause
  }
}

export function createFetchUtils(checkPermission) {
  return async function fetch(url, { method = 'GET', headers = {}, body, timeout = 30_000 } = {}) {
    if (checkPermission) checkPermission('fetch', `${method}:${url}`)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
      const res = await globalThis.fetch(url, { method, headers, body, signal: controller.signal })
      const text = await res.text()
      return {
        ok:         res.ok,
        status:     res.status,
        statusText: res.statusText,
        headers:    Object.fromEntries(res.headers),
        text:       () => Promise.resolve(text),
        json:       () => Promise.resolve(JSON.parse(text)),
      }
    } catch (err) {
      throw new FetchError(err.message, { cause: err })
    } finally {
      clearTimeout(timer)
    }
  }
}
