import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import {
  shortHash, getProjectKey,
  resolvePath,
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

  it('returns bare hash when no config and no name arg', async () => {
    expect(await getProjectKey(tmp)).toMatch(/^[0-9a-f]{8}$/)
  })
  it('returns name-hash when name arg provided', async () => {
    expect(await getProjectKey(tmp, 'myproject')).toBe(`myproject-${shortHash(tmp)}`)
  })
  it('returns stable id from project.local.json when present', async () => {
    await mkdir(join(tmp, '.crunes'), { recursive: true })
    await writeFile(join(tmp, '.crunes', 'project.local.json'), JSON.stringify({ id: 'stable-xyz', alias: 'myapp' }), 'utf8')
    expect(await getProjectKey(tmp)).toBe('stable-xyz')
  })
  it('name arg takes precedence over project.local.json', async () => {
    await mkdir(join(tmp, '.crunes'), { recursive: true })
    await writeFile(join(tmp, '.crunes', 'project.local.json'), JSON.stringify({ id: 'stable-xyz', alias: 'myapp' }), 'utf8')
    expect(await getProjectKey(tmp, 'override')).toBe(`override-${shortHash(tmp)}`)
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

  // global plugin prefixes
  it('@global-plugin-sqlite resolves to store sqlite plugins dir', () => {
    const store = process.env.CRUNES_STORE
    expect(resolvePath('@global-plugin-sqlite', { dir: tmp, pluginId: 'plug@1.0' }))
      .toBe(join(store, 'sqlite', 'plugins', 'plug@1.0'))
  })
  it('@global-plugin-cache resolves to store cache plugins dir', () => {
    const store = process.env.CRUNES_STORE
    expect(resolvePath('@global-plugin-cache', { dir: tmp, pluginId: 'plug@1.0' }))
      .toBe(join(store, 'cache', 'plugins', 'plug@1.0'))
  })
  it('@global-plugin-cache/subdir appended to plugin cache base', () => {
    const store = process.env.CRUNES_STORE
    expect(resolvePath('@global-plugin-cache/ns', { dir: tmp, pluginId: 'plug@1.0' }))
      .toBe(join(store, 'cache', 'plugins', 'plug@1.0', 'ns'))
  })

  // local prefixes
  it('@local-cache resolves inside .crunes/caches/project', () => {
    expect(resolvePath('@local-cache', { dir: tmp }))
      .toBe(join(tmp, '.crunes', 'caches', 'project'))
  })
  it('@local-sqlite resolves inside .crunes/sqlite/project', () => {
    expect(resolvePath('@local-sqlite', { dir: tmp }))
      .toBe(join(tmp, '.crunes', 'sqlite', 'project'))
  })
  it('@local-plugin-cache resolves inside .crunes/caches/plugins/<pluginId>', () => {
    expect(resolvePath('@local-plugin-cache', { dir: tmp, pluginId: 'plug@1.0' }))
      .toBe(join(tmp, '.crunes', 'caches', 'plugins', 'plug@1.0'))
  })
  it('@local-plugin-sqlite without pluginId throws', () => {
    expect(() => resolvePath('@local-plugin-sqlite', { dir: tmp }))
      .toThrow('@local-plugin-sqlite requires a plugin context')
  })

  it('subpath escaping virtual root throws RangeError', () => {
    expect(() => resolvePath('@global-plugin-sqlite/../etc', { dir: tmp, pluginId: 'plug@1.0' }))
      .toThrow(RangeError)
  })
  it('@global-plugin-sqlite without pluginId throws', () => {
    expect(() => resolvePath('@global-plugin-sqlite', { dir: tmp }))
      .toThrow('@global-plugin-sqlite requires a plugin context')
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
    expect(p).not.toContain('sqlite.read:@global-plugin-sqlite/**')
  })
  it('includes global plugin store permits when pluginId set', () => {
    const p = getAutoPermits({ pluginId: 'plug@1.0' })
    expect(p).toContain('sqlite.read:@global-plugin-sqlite/**')
    expect(p).toContain('sqlite.write:@global-plugin-sqlite/**')
    expect(p).toContain('cache.read:@global-plugin-cache/**')
    expect(p).toContain('fs.read:@global-plugin-sqlite/**')
    expect(p).toContain('fs.write:@global-plugin-sqlite/**')
    expect(p).not.toContain('sqlite.read:@global-project-plugin-sqlite/**')
  })
  it('does not include legacy permit names when pluginId set', () => {
    const p = getAutoPermits({ pluginId: 'plug@1.0' })
    expect(p).not.toContain('sqlite.read:@plugin-sqlite/**')
    expect(p).not.toContain('cache.read:@plugin-cache/**')
  })
  it('includes all permits when both pluginId and pluginDir set', () => {
    const p = getAutoPermits({ pluginId: 'plug@1.0', pluginDir: '/dir' })
    expect(p).toContain('fs.read:@plugin/**')
    expect(p).toContain('sqlite.read:@global-plugin-sqlite/**')
    expect(p).not.toContain('fs.read:./.crunes/**')
  })
})
