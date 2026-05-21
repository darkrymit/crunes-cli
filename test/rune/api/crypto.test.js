import { describe, it, expect } from 'vitest'
import { hashHex, hashBase64, uuid, hex, base64 } from '../../../src/rune/api/crypto.js'

describe('hashHex', () => {
  it('sha256 of empty string matches known digest', () => {
    expect(hashHex('sha256', '')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
  it('sha256 of hello matches known digest', () => {
    expect(hashHex('sha256', 'hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })
  it('md5 of hello matches known digest', () => {
    expect(hashHex('md5', 'hello')).toBe('5d41402abc4b2a76b9719d911017c592')
  })
  it('unknown algorithm throws with algorithm name in message', () => {
    expect(() => hashHex('not-a-real-algo', 'data')).toThrow('not-a-real-algo')
  })
})

describe('hashBase64', () => {
  it('sha256 of empty string matches known digest', () => {
    expect(hashBase64('sha256', '')).toBe('47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=')
  })
  it('unknown algorithm throws with algorithm name in message', () => {
    expect(() => hashBase64('not-a-real-algo', 'data')).toThrow('not-a-real-algo')
  })
})

describe('uuid', () => {
  it('returns a v4 UUID string', () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
  it('returns unique values on successive calls', () => {
    expect(uuid()).not.toBe(uuid())
  })
})

describe('hex', () => {
  it('returns 32 hex chars for 16 bytes', () => {
    const result = hex(16)
    expect(result).toHaveLength(32)
    expect(result).toMatch(/^[0-9a-f]+$/)
  })
  it('returns 64 hex chars for 32 bytes', () => {
    expect(hex(32)).toHaveLength(64)
  })
  it('returns unique values on successive calls', () => {
    expect(hex(16)).not.toBe(hex(16))
  })
})

describe('base64', () => {
  it('returns 24-char base64 string for 16 bytes', () => {
    const result = base64(16)
    expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(result).toHaveLength(24)
  })
  it('returns unique values on successive calls', () => {
    expect(base64(16)).not.toBe(base64(16))
  })
})
