import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { runRuneInIsolate } from '../../../src/rune/isolation/runner.js'

let dir
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'crunes-zstd-')) })
// Fails on Windows while a handle is still open, so it also checks that streams close.
afterEach(async () => { await fs.rm(dir, { recursive: true }) })

async function run(body, opts = {}) {
  const rune = path.join(dir, 'rune.js')
  await fs.writeFile(rune, `import { fs } from '@utils'\nexport async function run() { ${body} }`)
  return runRuneInIsolate(rune, { allow: ['fs.read:**'], deny: [] }, [], dir, opts)
}
const put = (text) => fs.writeFile(path.join(dir, 'a.zst'), zstdCompressSync(Buffer.from(text)))

describe('fs.readLinesStream decompress', () => {
  it('yields the lines of a zstd file, filtered before they enter the sandbox', async () => {
    await put('ключ 1\r\nskip\nключ 2')
    expect(await run(`const o = []; for await (const l of fs.readLinesStream('a.zst', { decompress: 'zstd', contains: ['ключ'] })) o.push(l); return o`)).toEqual(['ключ 1', 'ключ 2'])
  })

  it('reads a file that decompresses past the sandbox limit', async () => {
    await put(('я'.repeat(500) + '\n').repeat(40_000))
    expect(await run(`let n = 0; for await (const l of fs.readLinesStream('a.zst', { decompress: 'zstd' })) n++; return n`, { isolateMemoryMb: 32 })).toBe(40_000)
  })

  it('stops early and releases the file', async () => {
    await put('line\n'.repeat(1_000_000))
    expect(await run(`for await (const l of fs.readLinesStream('a.zst', { decompress: 'zstd' })) return l`)).toBe('line')
  })

  it('reports a corrupt file, a missing file and an unknown format', async () => {
    await fs.writeFile(path.join(dir, 'a.zst'), 'not zstd at all')
    const drain = (name, fmt) => run(`for await (const l of fs.readLinesStream('${name}', { decompress: '${fmt}' })); return 'no error'`)
    await expect(drain('a.zst', 'zstd')).rejects.toThrow()
    await expect(drain('nope.zst', 'zstd')).rejects.toThrow('ENOENT')
    await expect(drain('a.zst', 'lz4')).rejects.toThrow('unsupported decompress')
  })
})
