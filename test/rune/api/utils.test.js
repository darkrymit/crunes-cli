import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import {
  shortHash, getProjectKey,
  resolvePath, canonicalizeLocation,
  getAutoPermits,
} from '../../../src/rune/api/utils.js'

async function makeTmp() {
  return mkdtemp(join(tmpdir(), 'crunes-utils-test-'))
}

describe('shortHash', () => {
  it('returns 8-char hex string', () => {
    expect(shortHash('hello')).toMatch(/^[0-9a-f]{8}$/)
  })
  it('same input produces same output', () => {
    expect(shortHash('abc')).toBe(shortHash('abc'))
  })
  it('different inputs produce different hashes', () => {
    expect(shortHash('abc')).not.toBe(shortHash('def'))
  })
})

describe('getProjectKey', () => {
  let tmp
  beforeEach(async () => { tmp = await makeTmp() })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('returns bare hash when no config and no name arg', () => {
    expect(getProjectKey(tmp)).toMatch(/^[0-9a-f]{8}$/)
  })
  it('returns name-hash when name arg provided', () => {
    expect(getProjectKey(tmp, 'myproject')).toBe(`myproject-${shortHash(tmp)}`)
  })
  it('falls back to config.json name when name arg absent', async () => {
    await mkdir(join(tmp, '.crunes'), { recursive: true })
    await writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify({ name: 'from-config' }), 'utf8')
    expect(getProjectKey(tmp)).toBe(`from-config-${shortHash(tmp)}`)
  })
  it('name arg takes precedence over config.json', async () => {
    await mkdir(join(tmp, '.crunes'), { recursive: true })
    await writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify({ name: 'from-config' }), 'utf8')
    expect(getProjectKey(tmp, 'override')).toBe(`override-${shortHash(tmp)}`)
  })
})

describe('resolvePath', () => {
  let tmp, pluginDir
  beforeEach(async () => {
    tmp       = await makeTmp()
    pluginDir = await makeTmp()
    process.env.CRUNES_STORE = await makeTmp()
  })
  afterEach(async () => {
    const store = process.env.CRUNES_STORE
    delete process.env.CRUNES_STORE
    await rm(tmp,       { recursive: true, force: true })
    await rm(pluginDir, { recursive: true, force: true })
    await rm(store,     { recursive: true, force: true })
  })

  it('@plugin/sub resolves into pluginDir', () => {
    expect(resolvePath('@plugin/assets/db.sqlite', { dir: tmp, pluginDir }))
      .toBe(join(pluginDir, 'assets', 'db.sqlite'))
  })
  it('@plugin/ without pluginDir throws', () => {
    expect(() => resolvePath('@plugin/foo', { dir: tmp }))
      .toThrow('@plugin/ paths are only available in plugin runes')
  })
  it('@project/sub resolves into project dir', () => {
    expect(resolvePath('@project/data/mydb', { dir: tmp }))
      .toBe(join(tmp, 'data', 'mydb'))
  })
  it('@plugin-sqlite resolves to store sqlite plugins dir', () => {
    const store = process.env.CRUNES_STORE
    expect(resolvePath('@plugin-sqlite', { dir: tmp, pluginId: 'plug@1.0' }))
      .toBe(join(store, 'sqlite', 'plugins', 'plug@1.0'))
  })
  it('@project-sqlite resolves to store sqlite projects dir', () => {
    const store = process.env.CRUNES_STORE
    const key = getProjectKey(tmp)
    expect(resolvePath('@project-sqlite', { dir: tmp }))
      .toBe(join(store, 'sqlite', 'projects', key))
  })
  it('@project-sqlite/subdir appended to project sqlite base', () => {
    const store = process.env.CRUNES_STORE
    const key = getProjectKey(tmp)
    expect(resolvePath('@project-sqlite/data/archive', { dir: tmp }))
      .toBe(join(store, 'sqlite', 'projects', key, 'data', 'archive'))
  })
  it('@plugin-cache resolves to store caches plugins dir', () => {
    const store = process.env.CRUNES_STORE
    expect(resolvePath('@plugin-cache', { dir: tmp, pluginId: 'plug@1.0' }))
      .toBe(join(store, 'caches', 'plugins', 'plug@1.0'))
  })
  it('@project-cache/subdir appended to project caches base', () => {
    const store = process.env.CRUNES_STORE
    const key = getProjectKey(tmp)
    expect(resolvePath('@project-cache/ns', { dir: tmp }))
      .toBe(join(store, 'caches', 'projects', key, 'ns'))
  })
  it('subpath escaping virtual root throws RangeError', () => {
    expect(() => resolvePath('@project-sqlite/../etc', { dir: tmp }))
      .toThrow(RangeError)
  })
  it('@plugin-sqlite without pluginId throws', () => {
    expect(() => resolvePath('@plugin-sqlite', { dir: tmp }))
      .toThrow('@plugin-sqlite requires a plugin context')
  })
  it('@project-sqlite uses projectName to avoid disk read', () => {
    const store = process.env.CRUNES_STORE
    expect(resolvePath('@project-sqlite', { dir: tmp, projectName: 'myproj' }))
      .toBe(join(store, 'sqlite', 'projects', `myproj-${shortHash(tmp)}`))
  })
  it('~/path resolves to homedir', () => {
    expect(resolvePath('~/foo/bar', { dir: tmp })).toBe(join(homedir(), 'foo', 'bar'))
  })
  it('absolute path returned as-is', () => {
    expect(resolvePath(tmp, { dir: tmp })).toBe(tmp)
  })
  it('relative path resolved against dir', () => {
    expect(resolvePath('./sub/path', { dir: tmp })).toBe(join(tmp, 'sub', 'path'))
  })
})

describe('canonicalizeLocation', () => {
  let tmp
  beforeEach(async () => { tmp = await makeTmp() })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('@project/subpath strips prefix to ./subpath', () => {
    expect(canonicalizeLocation('@project/data/foo', { dir: tmp })).toBe('./data/foo')
  })
  it('@plugin/path returned verbatim', () => {
    expect(canonicalizeLocation('@plugin/assets', { dir: tmp })).toBe('@plugin/assets')
  })
  it('@project-sqlite returned verbatim', () => {
    expect(canonicalizeLocation('@project-sqlite', { dir: tmp })).toBe('@project-sqlite')
  })
  it('@project-sqlite/subpath returned verbatim', () => {
    expect(canonicalizeLocation('@project-sqlite/data/archive', { dir: tmp })).toBe('@project-sqlite/data/archive')
  })
  it('@plugin-sqlite returned verbatim', () => {
    expect(canonicalizeLocation('@plugin-sqlite', { dir: tmp })).toBe('@plugin-sqlite')
  })
  it('~/path returned verbatim', () => {
    expect(canonicalizeLocation('~/foo', { dir: tmp })).toBe('~/foo')
  })
  it('bare relative path normalized to ./ form', () => {
    expect(canonicalizeLocation('sub/path', { dir: tmp })).toBe('./sub/path')
  })
  it('./relative kept as-is', () => {
    expect(canonicalizeLocation('./foo', { dir: tmp })).toBe('./foo')
  })
  it('../outside preserved with ../ prefix', () => {
    expect(canonicalizeLocation('../outside', { dir: tmp })).toBe('../outside')
  })
})

describe('getAutoPermits', () => {
  it('returns .crunes read permit when called with no args (project rune default)', () => {
    expect(getAutoPermits()).toContain('fs.read:./.crunes/**')
  })
  it('returns .crunes read permit when pluginId and pluginDir are null', () => {
    expect(getAutoPermits({ pluginId: null, pluginDir: null })).toContain('fs.read:./.crunes/**')
  })
  it('does not include .crunes permit when pluginDir is set (plugin rune)', () => {
    const p = getAutoPermits({ pluginDir: '/some/dir' })
    expect(p).not.toContain('fs.read:./.crunes/**')
  })
  it('includes fs.read/@plugin and fs.write/@plugin when pluginDir set', () => {
    const p = getAutoPermits({ pluginDir: '/some/dir' })
    expect(p).toContain('fs.read:@plugin/**')
    expect(p).toContain('fs.write:@plugin/**')
    expect(p).not.toContain('sqlite.read:@plugin-sqlite/**')
  })
  it('includes store permits when pluginId set', () => {
    const p = getAutoPermits({ pluginId: 'plug@1.0' })
    expect(p).toContain('sqlite.read:@plugin-sqlite/**')
    expect(p).toContain('sqlite.write:@plugin-sqlite/**')
    expect(p).toContain('cache.read:@plugin-cache/**')
    expect(p).toContain('sqlite.read:@project-plugin-sqlite/**')
    expect(p).toContain('fs.read:@plugin-sqlite/**')
    expect(p).toContain('fs.write:@plugin-sqlite/**')
  })
  it('includes all permits when both pluginId and pluginDir set', () => {
    const p = getAutoPermits({ pluginId: 'plug@1.0', pluginDir: '/dir' })
    expect(p).toContain('fs.read:@plugin/**')
    expect(p).toContain('sqlite.read:@plugin-sqlite/**')
    expect(p).not.toContain('fs.read:./.crunes/**')
  })
})
