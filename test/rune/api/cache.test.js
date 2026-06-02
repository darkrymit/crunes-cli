import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCacheUtils } from '../../../src/rune/api/cache.js'
import { makePermissionChecker, PermissionError } from '../../../src/rune/permissions/permissions.js'

async function makeTmp() {
  return mkdtemp(join(tmpdir(), 'crunes-cache-test-'))
}

describe('createCacheUtils', () => {
  let tmp
  beforeEach(async () => {
    tmp = await makeTmp()
    process.env.CRUNES_STORE = tmp
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    await rm(tmp, { recursive: true, force: true })
  })

  // --- Core handle operations ---

  it('set + get roundtrip preserves value', async () => {
    const cache = createCacheUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await cache.openHandle('@global-plugin-cache', 'test')
    await h.set('k', { x: 1 })
    expect(await h.get('k')).toEqual({ x: 1 })
  })

  it('get on missing key returns null', async () => {
    const cache = createCacheUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await cache.openHandle('@global-plugin-cache', 'test')
    expect(await h.get('missing')).toBe(null)
  })

  it('set with TTL: get before expiry returns value', async () => {
    const cache = createCacheUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await cache.openHandle('@global-plugin-cache', 'test')
    await h.set('k', 'val', 3600)
    expect(await h.get('k')).toBe('val')
  })

  it('set with TTL: get after expiry returns null', async () => {
    const cache = createCacheUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await cache.openHandle('@global-plugin-cache', 'test')
    await h.set('k', 'val', -1)
    expect(await h.get('k')).toBe(null)
  })

  it('delete removes a key', async () => {
    const cache = createCacheUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await cache.openHandle('@global-plugin-cache', 'test')
    await h.set('k', 'val')
    await h.delete('k')
    expect(await h.get('k')).toBe(null)
  })

  it('clear removes all keys', async () => {
    const cache = createCacheUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await cache.openHandle('@global-plugin-cache', 'test')
    await h.set('a', 1)
    await h.set('b', 2)
    await h.clear()
    expect(await h.get('a')).toBe(null)
    expect(await h.get('b')).toBe(null)
  })

  it('clear on missing cache dir does not throw', async () => {
    const cache = createCacheUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await cache.openHandle('@global-plugin-cache', 'nonexistent')
    await expect(h.clear()).resolves.toBeUndefined()
  })

  it('non-serializable value throws TypeError', async () => {
    const cache = createCacheUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await cache.openHandle('@global-plugin-cache', 'test')
    await expect(h.set('k', BigInt(1))).rejects.toThrow(TypeError)
  })

  it('name defaults to "default" when omitted', async () => {
    const cache = createCacheUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h1 = await cache.openHandle('@global-plugin-cache')
    const h2 = await cache.openHandle('@global-plugin-cache', 'default')
    await h1.set('k', 42)
    expect(await h2.get('k')).toBe(42)
  })

  it('different cache names are isolated from each other', async () => {
    const cache = createCacheUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const a = await cache.openHandle('@global-plugin-cache', 'a')
    const b = await cache.openHandle('@global-plugin-cache', 'b')
    await a.set('k', 'in-a')
    expect(await b.get('k')).toBe(null)
  })

  // --- Location / pluginId guards ---

  it('@global-plugin-cache without pluginId throws', async () => {
    const cache = createCacheUtils(tmp, null)
    await expect(cache.openHandle('@global-plugin-cache', 'test')).rejects.toThrow('@global-plugin-cache requires a plugin context')
  })

  it('@global-project-plugin-cache without pluginId throws', async () => {
    const cache = createCacheUtils(tmp, null)
    await expect(cache.openHandle('@global-project-plugin-cache', 'test')).rejects.toThrow('@global-project-plugin-cache requires a plugin context')
  })

  it('@global-project-cache works without pluginId (local rune)', async () => {
    const cache = createCacheUtils(tmp, null)
    const h = await cache.openHandle('@global-project-cache', 'test')
    await h.set('k', 'local-val')
    expect(await h.get('k')).toBe('local-val')
  })

  // --- Permissions ---

  it('@global-plugin-cache calls checkPermission with @global-plugin-cache:name token', async () => {
    const spy = vi.fn()
    const cache = createCacheUtils(tmp, spy, { pluginId: 'plug@1.0.0' })
    const h = await cache.openHandle('@global-plugin-cache', 'test')
    await h.set('k', 'v')
    expect(spy).toHaveBeenCalledWith('cache.write', '@global-plugin-cache:test')
    await h.get('k')
    expect(spy).toHaveBeenCalledWith('cache.read', '@global-plugin-cache:test')
  })

  it('cache.write checked on set for arbitrary paths', async () => {
    const spy = vi.fn()
    const cache = createCacheUtils(tmp, spy)
    const h = await cache.openHandle('./my-dir', 'test')
    try { await h.set('k', 'v') } catch {}
    expect(spy).toHaveBeenCalledWith('cache.write', './my-dir:test')
  })

  it('cache.read checked on get for arbitrary paths', async () => {
    const spy = vi.fn()
    const cache = createCacheUtils(tmp, spy)
    const h = await cache.openHandle('./my-dir', 'test')
    try { await h.get('k') } catch {}
    expect(spy).toHaveBeenCalledWith('cache.read', './my-dir:test')
  })

  it('cache.write checked on delete for arbitrary paths', async () => {
    const spy = vi.fn()
    const cache = createCacheUtils(tmp, spy)
    const h = await cache.openHandle('./my-dir', 'test')
    try { await h.delete('k') } catch {}
    expect(spy).toHaveBeenCalledWith('cache.write', './my-dir:test')
  })

  it('cache.write checked on clear for arbitrary paths', async () => {
    const spy = vi.fn()
    const cache = createCacheUtils(tmp, spy)
    const h = await cache.openHandle('./my-dir', 'test')
    try { await h.clear() } catch {}
    expect(spy).toHaveBeenCalledWith('cache.write', './my-dir:test')
  })

  it('PermissionError thrown by get when cache.read not granted', async () => {
    const checker = makePermissionChecker({ allow: [], deny: [] })
    const cache = createCacheUtils(tmp, checker)
    const h = await cache.openHandle('./my-dir', 'test')
    await expect(h.get('k')).rejects.toThrow(PermissionError)
  })

  it('PermissionError thrown by set when cache.write not granted', async () => {
    const checker = makePermissionChecker({ allow: [], deny: [] })
    const cache = createCacheUtils(tmp, checker)
    const h = await cache.openHandle('./my-dir', 'test')
    await expect(h.set('k', 'v')).rejects.toThrow(PermissionError)
  })

  it('cache.read granted allows get but not set', async () => {
    const checker = makePermissionChecker({ allow: ['cache.read:./my-dir::test'], deny: [] })
    const cache = createCacheUtils(tmp, checker)
    const h = await cache.openHandle('./my-dir', 'test')
    await expect(h.get('k')).resolves.toBe(null)
    await expect(h.set('k', 'v')).rejects.toThrow(PermissionError)
  })

  it('name defaults to "default" in permission token when omitted', async () => {
    const spy = vi.fn()
    const cache = createCacheUtils(tmp, spy)
    const h = await cache.openHandle('./my-dir')
    try { await h.get('k') } catch {}
    expect(spy).toHaveBeenCalledWith('cache.read', './my-dir:default')
  })

  it('@global-project-cache calls checkPermission with @global-project-cache:name token', async () => {
    const spy = vi.fn()
    const cache = createCacheUtils(tmp, spy)
    const h = await cache.openHandle('@global-project-cache', 'myns')
    try { await h.set('k', 'v') } catch {}
    expect(spy).toHaveBeenCalledWith('cache.write', '@global-project-cache:myns')
  })

  it('@global-project-cache/subdir calls checkPermission with subpath token', async () => {
    const spy = vi.fn()
    const cache = createCacheUtils(tmp, spy)
    const h = await cache.openHandle('@global-project-cache/data', 'myns')
    try { await h.get('k') } catch {}
    expect(spy).toHaveBeenCalledWith('cache.read', '@global-project-cache/data:myns')
  })

  it('@global-project-cache/subdir stores and retrieves values', async () => {
    const cache = createCacheUtils(tmp, null)
    const h = await cache.openHandle('@global-project-cache/level1/level2', 'myns')
    await h.set('k', 42)
    expect(await h.get('k')).toBe(42)
  })

  it('subpath escape throws RangeError', async () => {
    const cache = createCacheUtils(tmp, null)
    await expect(cache.openHandle('@global-project-cache/../etc', 'myns')).rejects.toThrow(RangeError)
  })

  it('@global-plugin-cache permission granted via allow pattern passes check', async () => {
    const checker = makePermissionChecker({
      allow: ['cache.read:@global-plugin-cache/**', 'cache.write:@global-plugin-cache/**'],
      deny: [],
    })
    const cache = createCacheUtils(tmp, checker, { pluginId: 'plug@1.0.0' })
    const h = await cache.openHandle('@global-plugin-cache', 'test')
    await expect(h.set('k', 'v')).resolves.toBeUndefined()
    expect(await h.get('k')).toBe('v')
  })
})

describe('CacheHandle â€” has', () => {
  let tmp
  beforeEach(async () => {
    tmp = await makeTmp()
    process.env.CRUNES_STORE = tmp
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    await rm(tmp, { recursive: true, force: true })
  })

  it('returns true for an existing key', async () => {
    const cache = createCacheUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await cache.openHandle('@global-plugin-cache', 'test')
    await h.set('k', { x: 1 })
    expect(await h.has('k')).toBe(true)
  })

  it('returns false for a missing key', async () => {
    const cache = createCacheUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await cache.openHandle('@global-plugin-cache', 'test')
    expect(await h.has('missing')).toBe(false)
  })

  it('returns false for an expired key', async () => {
    const cache = createCacheUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await cache.openHandle('@global-plugin-cache', 'test')
    await h.set('k', 'val', -1)
    expect(await h.has('k')).toBe(false)
  })

  it('requires cache.read permission', async () => {
    const cache = createCacheUtils(tmp, makePermissionChecker({ allow: [], deny: [] }), { pluginId: 'plug@1.0.0' })
    const h = await cache.openHandle('@global-plugin-cache', 'test')
    await expect(h.has('k')).rejects.toThrow(PermissionError)
  })
})
