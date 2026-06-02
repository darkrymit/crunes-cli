export class FetchError extends Error {
  constructor(message, { cause } = {}) {
    super(message)
    this.name = 'FetchError'
    if (cause !== undefined) this.cause = cause
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

  return { fetch }
}
