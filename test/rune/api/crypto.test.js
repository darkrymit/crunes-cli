import { describe, it, expect } from 'vitest'
import {
  hash,
  hashAsHex,
  hashAsBase64,
  hmac,
  hmacAsHex,
  hmacAsBase64,
  uuid,
  randomHex,
  randomBase64,
  encrypt,
  decrypt,
} from '../../../src/rune/api/crypto.js'

describe('hashing', () => {
  it('hash returns raw Uint8Array bytes', () => {
    const digest = hash('sha256', 'hello')
    expect(digest).toBeInstanceOf(Uint8Array)
    expect(digest).toHaveLength(32)
  })

  it('hashAsHex returns hex string', () => {
    expect(hashAsHex('sha256', 'hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('hashAsBase64 returns base64 string', () => {
    expect(hashAsBase64('sha256', '')).toBe('47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=')
  })
})

describe('hmac', () => {
  const key = 'secret-key'
  const data = 'hello-world'

  it('hmac returns raw Uint8Array bytes', () => {
    const sig = hmac('sha256', key, data)
    expect(sig).toBeInstanceOf(Uint8Array)
    expect(sig).toHaveLength(32)
  })

  it('hmacAsHex returns Hex string signature', () => {
    expect(hmacAsHex('sha256', key, data)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hmacAsBase64 returns Base64 string signature', () => {
    expect(hmacAsBase64('sha256', key, data)).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })
})

describe('symmetric encryption & decryption (pure bytes)', () => {
  const key = new Uint8Array(32).fill(1)
  const iv = new Uint8Array(16).fill(2)
  const cleartext = new Uint8Array([104, 101, 108, 108, 111]) // 'hello'

  it('encrypts and decrypts (aes-256-cbc)', () => {
    const cipher = encrypt('aes-256-cbc', key, iv, cleartext)
    expect(cipher).toBeInstanceOf(Uint8Array)

    const decrypted = decrypt('aes-256-cbc', key, iv, cipher)
    expect(decrypted).toEqual(cleartext)
  })

  it('encrypts and decrypts (aes-256-gcm with auth tag)', () => {
    const cipher = encrypt('aes-256-gcm', key, iv, cleartext)
    expect(cipher).toBeInstanceOf(Uint8Array)

    const decrypted = decrypt('aes-256-gcm', key, iv, cipher)
    expect(decrypted).toEqual(cleartext)
  })
})

describe('randomizer utilities', () => {
  it('uuid returns v4 UUID', () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
  it('randomHex', () => {
    expect(randomHex(16)).toHaveLength(32)
  })
  it('randomBase64', () => {
    expect(randomBase64(16)).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })
})
