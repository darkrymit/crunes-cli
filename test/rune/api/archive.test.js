import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createArchiveUtils } from '../../../src/rune/api/archive.js'
import { makePermissionChecker, PermissionError } from '../../../src/rune/permissions/permissions.js'

async function makeTmp() {
  return mkdtemp(join(tmpdir(), 'crunes-archive-'))
}

describe('createArchiveUtils — zip + unzip roundtrip', () => {
  let tmp
  beforeEach(async () => { tmp = await makeTmp() })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('packs a directory and extracts all files', async () => {
    const src = join(tmp, 'src')
    await mkdir(src)
    await writeFile(join(src, 'a.txt'), 'hello')
    await writeFile(join(src, 'b.txt'), 'world')
    const arc = createArchiveUtils(tmp, null)
    await arc.zip('src', 'out.zip')
    await arc.unzip('out.zip', 'extracted')
    expect(await readFile(join(tmp, 'extracted', 'a.txt'), 'utf8')).toBe('hello')
    expect(await readFile(join(tmp, 'extracted', 'b.txt'), 'utf8')).toBe('world')
  })

  it('packs a single file', async () => {
    await writeFile(join(tmp, 'file.txt'), 'content')
    const arc = createArchiveUtils(tmp, null)
    await arc.zip('file.txt', 'out.zip')
    await arc.unzip('out.zip', 'extracted')
    expect(await readFile(join(tmp, 'extracted', 'file.txt'), 'utf8')).toBe('content')
  })

  it('unzip creates dest directory if absent', async () => {
    await writeFile(join(tmp, 'file.txt'), 'x')
    const arc = createArchiveUtils(tmp, null)
    await arc.zip('file.txt', 'out.zip')
    await arc.unzip('out.zip', 'newdir')
    expect(await readFile(join(tmp, 'newdir', 'file.txt'), 'utf8')).toBe('x')
  })
})

describe('createArchiveUtils — tar + untar roundtrip', () => {
  let tmp
  beforeEach(async () => { tmp = await makeTmp() })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('packs a directory and extracts all files', async () => {
    const src = join(tmp, 'src')
    await mkdir(src)
    await writeFile(join(src, 'c.txt'), 'foo')
    const arc = createArchiveUtils(tmp, null)
    await arc.tar('src', 'out.tar.gz')
    await arc.untar('out.tar.gz', 'extracted')
    expect(await readFile(join(tmp, 'extracted', 'c.txt'), 'utf8')).toBe('foo')
  })

  it('packs a single file', async () => {
    await writeFile(join(tmp, 'file.txt'), 'data')
    const arc = createArchiveUtils(tmp, null)
    await arc.tar('file.txt', 'out.tar.gz')
    await arc.untar('out.tar.gz', 'extracted')
    expect(await readFile(join(tmp, 'extracted', 'file.txt'), 'utf8')).toBe('data')
  })
})

describe('createArchiveUtils — permissions', () => {
  let tmp
  beforeEach(async () => { tmp = await makeTmp() })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('zip calls checkPermission with fs.read on source and fs.write on dest', async () => {
    await writeFile(join(tmp, 'file.txt'), 'x')
    const spy = vi.fn()
    const arc = createArchiveUtils(tmp, spy)
    await arc.zip('file.txt', 'out.zip')
    expect(spy).toHaveBeenCalledWith('fs.read', './file.txt')
    expect(spy).toHaveBeenCalledWith('fs.write', './out.zip')
  })

  it('throws PermissionError before any I/O when permission is denied', async () => {
    const check = makePermissionChecker({ allow: [], deny: [] })
    const arc = createArchiveUtils(tmp, check)
    await expect(arc.zip('file.txt', 'out.zip')).rejects.toThrow(PermissionError)
    await expect(readFile(join(tmp, 'out.zip'))).rejects.toThrow()
  })
})
