import { describe, it, expect } from 'vitest'
import { Readable } from 'node:stream'
import { createStdinUtils } from '../stdin.js'

function makeStream(chunks, isTTY = false) {
  const s = Readable.from(chunks.map(c => Buffer.from(c)))
  s.isTTY = isTTY
  return s
}

describe('createStdinUtils', () => {
  it('returns null and reports isTTY=true when stream is a TTY', async () => {
    const stdin = createStdinUtils({ stream: makeStream([], true) })
    expect(stdin.isTTY).toBe(true)
    expect(await stdin.read()).toBeNull()
    expect(await stdin.readBytes()).toBeNull()
  })

  it('returns null and reports isTTY=true when allowStdin is false', async () => {
    const stdin = createStdinUtils({ allowStdin: false, stream: makeStream(['abc'], false) })
    expect(stdin.isTTY).toBe(true)
    expect(await stdin.read()).toBeNull()
  })

  it('reads piped text and caches repeated reads', async () => {
    const stdin = createStdinUtils({ stream: makeStream(['hello ', 'world'], false) })
    expect(stdin.isTTY).toBe(false)
    expect(await stdin.read()).toBe('hello world')
    expect(await stdin.read()).toBe('hello world')
    expect(Buffer.from(await stdin.readBytes()).toString('utf8')).toBe('hello world')
  })

  it('enforces maxBytes limit', async () => {
    const stdin = createStdinUtils({ stream: makeStream(['123456'], false) })
    await expect(stdin.read({ maxBytes: 4 })).rejects.toThrow(/maxBytes/)
  })
})
