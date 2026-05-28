import { describe, it, expect } from 'vitest'
import {
  toHex,
  fromHex,
  toBase64,
  fromBase64,
  fromUtf8,
  toUtf8,
} from '../../../src/rune/api/codec.js'

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
