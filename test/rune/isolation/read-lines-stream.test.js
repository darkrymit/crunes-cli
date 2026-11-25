import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runRuneInIsolate } from '../../../src/rune/isolation/runner.js'
import { setupCrunesTest } from '../../../src/test/index.js'

let dir
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'crunes-lines-'))
})
afterEach(async () => {
  // Fails on Windows while a handle is still open, so it also checks that streams close.
  await fs.rm(dir, { recursive: true })
})

async function run(body, { allow = ['fs.read:**'], ...opts } = {}) {
  const rune = path.join(dir, 'rune.js')
  await fs.writeFile(rune, `import { fs } from '@utils'\nexport async function run() { ${body} }`)
  return runRuneInIsolate(rune, { allow, deny: [] }, [], dir, opts)
}

const collect = (args) => `const out = []; for await (const l of fs.readLinesStream(${args})) out.push(l); return out`

describe('fs.readLinesStream in a rune', () => {
  it('yields lines without LF or CRLF, keeps blank lines, strips a BOM and reads an unterminated last line', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), '﻿one\r\n\ntwo\nlast')
    expect(await run(collect("'a.txt'"))).toEqual(['one', '', 'two', 'last'])
  })

  it('yields nothing for an empty file', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), '')
    expect(await run(collect("'a.txt'"))).toEqual([])
  })

  it('keeps Cyrillic intact across read chunk boundaries', async () => {
    // Odd prefix puts two-byte characters astride the 1 MB chunk edges.
    const long = 'x' + 'я'.repeat(1_500_000)
    await fs.writeFile(path.join(dir, 'a.txt'), `${long}\nкінець\n`)
    const result = await run(`const out = []; for await (const l of fs.readLinesStream('a.txt')) out.push([l.length, l.includes('\\ufffd'), l.slice(-3)]); return out`)
    expect(result).toEqual([[long.length, false, 'яяя'], [6, false, 'ець']])
  })

  it('yields only lines holding one of the contains strings', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), 'ключ 1\nskip\nkey 2\nskip\n')
    expect(await run(collect("'a.txt', { contains: ['ключ', 'key'] }"))).toEqual(['ключ 1', 'key 2'])
  })

  it('rejects a contains value that is not an array', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), 'x\n')
    await expect(run(collect("'a.txt', { contains: 'x' }"))).rejects.toThrow('contains must be an array')
  })

  it('requires the fs.read permission', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), 'x\n')
    await expect(run(collect("'a.txt'"), { allow: [] })).rejects.toThrow('fs.read')
  })

  it('reports a missing file', async () => {
    await expect(run(collect("'nope.txt'"))).rejects.toThrow('ENOENT')
  })

  it('stops early and releases the file', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), 'line of text\n'.repeat(400_000))
    expect(await run(`for await (const l of fs.readLinesStream('a.txt')) return l`)).toBe('line of text')
  })

  it('reads a two-byte file larger than the sandbox memory limit', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), ('я'.repeat(500) + '\n').repeat(40_000))
    expect(await run(`let n = 0; for await (const l of fs.readLinesStream('a.txt')) n++; return n`, { isolateMemoryMb: 32 })).toBe(40_000)
  })
})

describe('fs.read size guard', () => {
  it('rejects two-byte text larger than the sandbox instead of aborting', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), 'я'.repeat(20 * 1024 * 1024))
    await expect(run(`return (await fs.read('a.txt')).length`, { isolateMemoryMb: 32 })).rejects.toThrow('fs.readLinesStream()')
  })

  it('still reads one-byte text of the same length', async () => {
    const n = 20 * 1024 * 1024
    await fs.writeFile(path.join(dir, 'a.txt'), 'x'.repeat(n))
    expect(await run(`return (await fs.read('a.txt')).length`, { isolateMemoryMb: 32 })).toBe(n)
  })
})

describe('fs.readLinesStream in setupCrunesTest', () => {
  it('reads filtered lines like the sandbox does', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), 'a\nключ\nb\n')
    const { utils, cleanup } = setupCrunesTest({ cwd: dir })
    const out = []
    for await (const l of utils.fs.readLinesStream('a.txt', { contains: ['ключ'] })) out.push(l)
    await cleanup()
    expect(out).toEqual(['ключ'])
  })
})
