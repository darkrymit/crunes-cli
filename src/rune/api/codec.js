import { Buffer } from 'node:buffer'

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
