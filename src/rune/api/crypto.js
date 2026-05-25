import { createHash, randomUUID, randomBytes, createHmac, createCipheriv, createDecipheriv } from 'node:crypto'

// Hashing
export function hash(algorithm, data) {
  try {
    const d = typeof data === 'string' ? data : Buffer.from(data)
    const digest = createHash(algorithm).update(d).digest()
    return new Uint8Array(digest.buffer, digest.byteOffset, digest.byteLength)
  } catch {
    throw new Error(`utils.crypto.hash: unknown algorithm '${algorithm}'`)
  }
}

export function hashAsHex(algorithm, data) {
  try {
    const d = typeof data === 'string' ? data : Buffer.from(data)
    return createHash(algorithm).update(d).digest('hex')
  } catch {
    throw new Error(`utils.crypto.hash: unknown algorithm '${algorithm}'`)
  }
}

export function hashAsBase64(algorithm, data) {
  try {
    const d = typeof data === 'string' ? data : Buffer.from(data)
    return createHash(algorithm).update(d).digest('base64')
  } catch {
    throw new Error(`utils.crypto.hash: unknown algorithm '${algorithm}'`)
  }
}

// HMAC
export function hmac(algorithm, key, data) {
  const k = typeof key === 'string' ? key : Buffer.from(key)
  const d = typeof data === 'string' ? data : Buffer.from(data)
  const signature = createHmac(algorithm, k).update(d).digest()
  return new Uint8Array(signature.buffer, signature.byteOffset, signature.byteLength)
}

export function hmacAsHex(algorithm, key, data) {
  const k = typeof key === 'string' ? key : Buffer.from(key)
  const d = typeof data === 'string' ? data : Buffer.from(data)
  return createHmac(algorithm, k).update(d).digest('hex')
}

export function hmacAsBase64(algorithm, key, data) {
  const k = typeof key === 'string' ? key : Buffer.from(key)
  const d = typeof data === 'string' ? data : Buffer.from(data)
  return createHmac(algorithm, k).update(d).digest('base64')
}

// Symmetric Encryption & Decryption (Pure Bytes)
export function encrypt(algorithm, key, iv, data) {
  const k = typeof key === 'string' ? Buffer.from(key, 'utf8') : Buffer.from(key)
  const i = typeof iv === 'string' ? Buffer.from(iv, 'utf8') : Buffer.from(iv)
  const d = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)
  const cipher = createCipheriv(algorithm, k, i)
  let encrypted = Buffer.concat([cipher.update(d), cipher.final()])
  if (algorithm.includes('gcm')) {
    const tag = cipher.getAuthTag()
    encrypted = Buffer.concat([encrypted, tag])
  }
  return new Uint8Array(encrypted.buffer, encrypted.byteOffset, encrypted.byteLength)
}

export function decrypt(algorithm, key, iv, ciphertext) {
  const k = typeof key === 'string' ? Buffer.from(key, 'utf8') : Buffer.from(key)
  const i = typeof iv === 'string' ? Buffer.from(iv, 'utf8') : Buffer.from(iv)
  const c = Buffer.from(ciphertext)
  
  let decipher
  let decrypted
  if (algorithm.includes('gcm')) {
    const tag = c.subarray(c.length - 16)
    const data = c.subarray(0, c.length - 16)
    decipher = createDecipheriv(algorithm, k, i)
    decipher.setAuthTag(tag)
    decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  } else {
    decipher = createDecipheriv(algorithm, k, i)
    decrypted = Buffer.concat([decipher.update(c), decipher.final()])
  }
  return new Uint8Array(decrypted.buffer, decrypted.byteOffset, decrypted.byteLength)
}

// Randomizer utilities
export function uuid() { return randomUUID() }
export function randomHex(size) { return randomBytes(size).toString('hex') }
export function randomBase64(size) { return randomBytes(size).toString('base64') }

// Encoding Conversions
export function toHex(data) {
  if (typeof data === 'string') return Buffer.from(data, 'utf8').toString('hex')
  return Buffer.from(data).toString('hex')
}

export function fromHex(hex) {
  const buf = Buffer.from(hex, 'hex')
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

export function toBase64(data) {
  if (typeof data === 'string') return Buffer.from(data, 'utf8').toString('base64')
  return Buffer.from(data).toString('base64')
}

export function fromBase64(base64) {
  const buf = Buffer.from(base64, 'base64')
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

export function fromUtf8(utf8) {
  const buf = Buffer.from(utf8, 'utf8')
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

export function toUtf8(data) {
  return Buffer.from(data).toString('utf8')
}
