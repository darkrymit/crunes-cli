import { describe, it, expect } from 'vitest'
import {
  toHex,
  fromHex,
  toBase64,
  fromBase64,
  fromUtf8,
  toUtf8,
} from '../../../src/rune/api/codec.js'
import { runRuneInIsolate } from '../../../src/rune/isolation/runner.js'
import path from 'node:path'
import fs from 'node:fs/promises'

describe('toHex / fromHex', () => {
  it('toHex encodes a string to hex', () => {
    expect(toHex('hello')).toBe('68656c6c6f')
  })

  it('toHex encodes Uint8Array to hex', () => {
    expect(toHex(new Uint8Array([0x0f, 0xff]))).toBe('0fff')
  })

  it('fromHex decodes hex to Uint8Array', () => {
    expect(Array.from(fromHex('68656c6c6f'))).toEqual([104, 101, 108, 108, 111])
  })

  it('toHex and fromHex roundtrip', () => {
    const bytes = new Uint8Array([1, 2, 3, 255])
    expect(Array.from(fromHex(toHex(bytes)))).toEqual([1, 2, 3, 255])
  })
})

describe('toBase64 / fromBase64', () => {
  it('toBase64 encodes a string', () => {
    expect(toBase64('hello')).toBe('aGVsbG8=')
  })

  it('toBase64 encodes Uint8Array', () => {
    expect(toBase64(new Uint8Array([104, 101, 108, 108, 111]))).toBe('aGVsbG8=')
  })

  it('fromBase64 decodes to Uint8Array', () => {
    expect(Array.from(fromBase64('aGVsbG8='))).toEqual([104, 101, 108, 108, 111])
  })

  it('toBase64 and fromBase64 roundtrip', () => {
    const bytes = new Uint8Array([1, 2, 3, 255])
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual([1, 2, 3, 255])
  })
})

describe('fromUtf8 / toUtf8', () => {
  it('fromUtf8 encodes a string to bytes', () => {
    expect(Array.from(fromUtf8('hi'))).toEqual([104, 105])
  })

  it('toUtf8 decodes bytes to string', () => {
    expect(toUtf8(new Uint8Array([104, 105]))).toBe('hi')
  })

  it('fromUtf8 and toUtf8 roundtrip', () => {
    expect(toUtf8(fromUtf8('hello world'))).toBe('hello world')
  })
})

describe('sandboxed streaming codecs', () => {
  it('codec base64 encoder handles non-aligned chunk remainder boundaries', async () => {
    const script = `
      import { codec } from '@utils'
      export async function run() {
        const stream = new ReadableStream({
          start(c) {
            c.enqueue(codec.fromUtf8("he")) // 2 bytes
            c.enqueue(codec.fromUtf8("llo")) // 3 bytes
            c.close()
          }
        })
        const encoder = codec.base64EncoderStream()
        const outStream = stream.pipeThrough(encoder)
        const reader = outStream.getReader()
        let text = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          text += value
        }
        return text
      }
    `
    const scriptPath = path.join(process.cwd(), 'scratch_test_codec.js')
    await fs.writeFile(scriptPath, script)
    try {
      const result = await runRuneInIsolate(scriptPath, { allow: [], deny: [] }, [], process.cwd())
      expect(result).toBe('aGVsbG8=')
    } finally {
      await fs.rm(scriptPath, { force: true })
    }
  })

  it('codec hex encoder and decoder stream roundtrip', async () => {
    const script = `
      import { codec } from '@utils'
      export async function run() {
        const stream = new ReadableStream({
          start(c) {
            c.enqueue(codec.fromUtf8("s"))
            c.enqueue(codec.fromUtf8("tre"))
            c.enqueue(codec.fromUtf8("aming hex!"))
            c.close()
          }
        })
        const enc = codec.hexEncoderStream()
        const dec = codec.hexDecoderStream()
        
        const piped = stream.pipeThrough(enc).pipeThrough(dec)
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
    const scriptPath = path.join(process.cwd(), 'scratch_test_codec_hex.js')
    await fs.writeFile(scriptPath, script)
    try {
      const result = await runRuneInIsolate(scriptPath, { allow: [], deny: [] }, [], process.cwd())
      expect(result).toBe('streaming hex!')
    } finally {
      await fs.rm(scriptPath, { force: true })
    }
  })
})
