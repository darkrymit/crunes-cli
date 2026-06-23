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
} from '../../../src/rune/api/crypt.js'
import { runRuneInIsolate } from '../../../src/rune/isolation/runner.js'
import path from 'node:path'
import fs from 'node:fs/promises'

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

describe('sandboxed streaming hashing and ciphers', () => {
  it('hashStream matches whole-buffer hash digest', async () => {
    const script = `
      import { crypt, codec } from '@utils'
      export async function run() {
        const stream = new ReadableStream({
          start(c) {
            c.enqueue(codec.fromUtf8("hello world"))
            c.close()
          }
        })
        const hashOut = await stream.pipeThrough(crypt.hashStream('sha256'))
        const reader = hashOut.getReader()
        const { value } = await reader.read()
        return codec.toHex(value)
      }
    `
    const scriptPath = path.join(process.cwd(), 'scratch_test_crypt.js')
    await fs.writeFile(scriptPath, script)
    try {
      const result = await runRuneInIsolate(scriptPath, { allow: [], deny: [] }, [], process.cwd())
      expect(result).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
    } finally {
      await fs.rm(scriptPath, { force: true })
    }
  })

  it('encryptStream and decryptStream roundtrip matches exactly', async () => {
    const script = `
      import { crypt, codec } from '@utils'
      export async function run() {
        const key = crypt.randomBytes(32)
        const iv = crypt.randomBytes(12)
        const plaintext = codec.fromUtf8("this is a super secret streaming payload of considerable size")
        
        const stream = new ReadableStream({
          start(c) {
            c.enqueue(plaintext.subarray(0, 15))
            c.enqueue(plaintext.subarray(15, 30))
            c.enqueue(plaintext.subarray(30))
            c.close()
          }
        })
        
        const encStream = crypt.encryptStream('aes-256-gcm', key, iv)
        const decStream = crypt.decryptStream('aes-256-gcm', key, iv)
        
        const piped = stream.pipeThrough(encStream).pipeThrough(decStream)
        const reader = piped.getReader()
        
        const chunks = []
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          chunks.push(value)
        }
        
        let total = 0
        for (const c of chunks) total += c.length
        const merged = new Uint8Array(total)
        let offset = 0
        for (const c of chunks) {
          merged.set(c, offset)
          offset += c.length
        }
        
        return codec.toUtf8(merged)
      }
    `
    const scriptPath = path.join(process.cwd(), 'scratch_test_crypt_roundtrip.js')
    await fs.writeFile(scriptPath, script)
    try {
      const result = await runRuneInIsolate(scriptPath, { allow: [], deny: [] }, [], process.cwd())
      expect(result).toBe('this is a super secret streaming payload of considerable size')
    } finally {
      await fs.rm(scriptPath, { force: true })
    }
  })
})
