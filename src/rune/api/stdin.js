export const DEFAULT_MAX_STDIN_BYTES = 10 * 1024 * 1024

/**
 * Lazy, cached host-side stdin reader for single-invocation `run` runes.
 * Returns `null` when stdin is a TTY or disabled (e.g. `repl`, `batch`, `args`).
 */
export function createStdinUtils({
  allowStdin = true,
  stream = process.stdin,
  defaultMaxBytes = DEFAULT_MAX_STDIN_BYTES,
} = {}) {
  let cachedBytes
  let pendingRead = null

  const isTTY = () => !allowStdin || Boolean(stream?.isTTY)

  async function readAllBytes(maxBytes) {
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      throw new RangeError('stdin: maxBytes must be a positive finite number')
    }
    if (isTTY()) return null
    if (cachedBytes !== undefined) {
      if (cachedBytes && cachedBytes.length > maxBytes) {
        throw new RangeError(`stdin exceeds maxBytes limit (${maxBytes})`)
      }
      return cachedBytes
    }
    if (!pendingRead) {
      pendingRead = (async () => {
        const chunks = []
        let total = 0
        for await (const chunk of stream) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          total += buf.length
          if (total > maxBytes) {
            throw new RangeError(`stdin exceeds maxBytes limit (${maxBytes})`)
          }
          chunks.push(buf)
        }
        const merged = Buffer.concat(chunks, total)
        cachedBytes = new Uint8Array(merged.buffer, merged.byteOffset, merged.byteLength)
        return cachedBytes
      })()
    }
    return pendingRead
  }

  return {
    get isTTY() {
      return isTTY()
    },
    async readBytes({ maxBytes = defaultMaxBytes } = {}) {
      return readAllBytes(maxBytes)
    },
    async read({ maxBytes = defaultMaxBytes } = {}) {
      const bytes = await readAllBytes(maxBytes)
      if (!bytes) return null
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8')
    },
  }
}
