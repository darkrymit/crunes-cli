import { createHash, randomUUID, randomBytes } from 'node:crypto'

export function hashHex(algorithm, data) {
  try {
    return createHash(algorithm).update(data).digest('hex')
  } catch {
    throw new Error(`utils.crypto.hash: unknown algorithm '${algorithm}'`)
  }
}

export function hashBase64(algorithm, data) {
  try {
    return createHash(algorithm).update(data).digest('base64')
  } catch {
    throw new Error(`utils.crypto.hash: unknown algorithm '${algorithm}'`)
  }
}

export function uuid() {
  return randomUUID()
}

export function hex(size) {
  return randomBytes(size).toString('hex')
}

export function base64(size) {
  return randomBytes(size).toString('base64')
}
