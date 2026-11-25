import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createFsUtils } from '../../../src/rune/api/fs.js'

let dir
beforeEach(async () => { dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'crunes-range-')) })
afterEach(async () => {
  vi.restoreAllMocks()
  await fsPromises.rm(dir, { recursive: true })
})

// What a range means, computed on the whole text.
function expected(text, from, to) {
  const content = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const trailing = content.endsWith('\n')
  const lines = (trailing ? content.slice(0, -1) : content).split('\n')
  const start = from == null ? 0 : from >= 0 ? from - 1 : Math.max(0, lines.length + from)
  const end = to == null ? lines.length : to >= 0 ? to : Math.max(0, lines.length + to + 1)
  const out = lines.slice(start, end)
  return out.length === 0 ? '' : out.join('\n') + (trailing ? '\n' : '')
}

const wide = Array.from({ length: 400 }, (_, i) => `${i} ` + 'я'.repeat((i * 37) % 900)).join('\n')
const texts = {
  empty: '',
  'newline only': '\n',
  'blank lines': '\n\n\na\n\n',
  'one line': 'one',
  'one line closed': 'one\n',
  crlf: 'a\r\nb\r\n\r\nc',
  'bom one line': '﻿one',
  'bom lines': '﻿a\nb\nc\n',
  'feff inside': 'a\n﻿b\nc',
  'wide open': wide,
  'wide closed': wide + '\n',
  'wide bom crlf': '﻿' + wide.replaceAll('\n', '\r\n') + '\r\n',
  'line longer than a chunk': 'x' + 'є'.repeat(100_000) + '\ny\n' + 'ї'.repeat(50_000),
}
const ranges = [[-1], [-2], [-3], [-80], [-399], [-400], [-401], [1, 1], [1, 2], [1, 80], [2, 3], [3, 2], [400, 400], [1, 400], [1, 401], [500, 600], [undefined, 2], [2], [-3, -2], [1, -2], [0, 2], [2, 0]]

describe('fs.read line ranges', () => {
  for (const [name, text] of Object.entries(texts)) {
    it(`matches whole-file slicing: ${name}`, async () => {
      await fsPromises.writeFile(path.join(dir, 'f.txt'), text)
      const { read } = createFsUtils(dir)
      for (const [from, to] of ranges) {
        expect(await read('f.txt', { from, to }), `from ${from} to ${to}`).toBe(expected(text, from, to))
      }
    })
  }

  it('does not load the whole file for a head or a tail', async () => {
    await fsPromises.writeFile(path.join(dir, 'f.txt'), wide)
    const readFile = vi.spyOn(fsPromises, 'readFile')
    const { read } = createFsUtils(dir)
    await read('f.txt', { from: 1, to: 5 })
    await read('f.txt', { from: -5 })
    expect(readFile).not.toHaveBeenCalled()
  })

  it('keeps missing-file behaviour', async () => {
    const { read } = createFsUtils(dir)
    expect(await read('nope.txt', { from: -5, throw: false })).toBe(null)
    await expect(read('nope.txt', { from: 1, to: 5 })).rejects.toThrow('ENOENT')
  })
})
