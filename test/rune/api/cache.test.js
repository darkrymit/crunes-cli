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
  beforeEach(async () => { tmp = await makeTmp() })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  // --- Core handle operations ---

  it('set + get roundtrip preserves value', async () => {
    const cache = createCacheUtils(tmp, null, 'plug@1.0.0', tmp)
    const h = cache.openHandle('@plugin-cache', 'test')
    await h.set('k', { x: 1 })
    expect(await h.get('k')).toEqual({ x: 1 })
  })

  it('get on missing key returns null', async () => {
    const cache = createCacheUtils(tmp, null, 'plug@1.0.0', tmp)
    const h = cache.openHandle('@plugin-cache', 'test')
    expect(await h.get('missing')).toBe(null)
  })

  it('set with TTL: get before expiry returns value', async () => {
    const cache = createCacheUtils(tmp, null, 'plug@1.0.0', tmp)
    const h = cache.openHandle('@plugin-cache', 'test')
    await h.set('k', 'val', 3600)
    expect(await h.get('k')).toBe('val')
  })

  it('set with TTL: get after expiry returns null', async () => {
    const cache = createCacheUtils(tmp, null, 'plug@1.0.0', tmp)
    const h = cache.openHandle('@plugin-cache', 'test')
    await h.set('k', 'val', -1)
    expect(await h.get('k')).toBe(null)
  })

  it('delete removes a key', async () => {
    const cache = createCacheUtils(tmp, null, 'plug@1.0.0', tmp)
    const h = cache.openHandle('@plugin-cache', 'test')
    await h.set('k', 'val')
    await h.delete('k')
    expect(await h.get('k')).toBe(null)
  })

  it('clear removes all keys', async () => {
    const cache = createCacheUtils(tmp, null, 'plug@1.0.0', tmp)
    const h = cache.openHandle('@plugin-cache', 'test')
    await h.set('a', 1)
    await h.set('b', 2)
    await h.clear()
    expect(await h.get('a')).toBe(null)
    expect(await h.get('b')).toBe(null)
  })

  it('clear on missing cache dir does not throw', async () => {
    const cache = createCacheUtils(tmp, null, 'plug@1.0.0', tmp)
    const h = cache.openHandle('@plugin-cache', 'nonexistent')
    await expect(h.clear()).resolves.toBeUndefined()
  })

  it('non-serializable value throws TypeError', async () => {
    const cache = createCacheUtils(tmp, null, 'plug@1.0.0', tmp)
    const h = cache.openHandle('@plugin-cache', 'test')
    await expect(h.set('k', BigInt(1))).rejects.toThrow(TypeError)
  })

  it('name defaults to "default" when omitted', async () => {
    const cache = createCacheUtils(tmp, null, 'plug@1.0.0', tmp)
    const h1 = cache.openHandle('@plugin-cache')
    const h2 = cache.openHandle('@plugin-cache', 'default')
    await h1.set('k', 42)
    expect(await h2.get('k')).toBe(42)
  })

  it('different cache names are isolated from each other', async () => {
    const cache = createCacheUtils(tmp, null, 'plug@1.0.0', tmp)
    const a = cache.openHandle('@plugin-cache', 'a')
    const b = cache.openHandle('@plugin-cache', 'b')
    await a.set('k', 'in-a')
    expect(await b.get('k')).toBe(null)
  })

  // --- Location / pluginId guards ---

  it('@plugin-cache without pluginId throws', () => {
    const cache = createCacheUtils(tmp, null, null, tmp)
    expect(() => cache.openHandle('@plugin-cache', 'test')).toThrow('@plugin-cache requires a plugin context')
  })

  it('@project-plugin-cache without pluginId throws', () => {
    const cache = createCacheUtils(tmp, null, null, tmp)
    expect(() => cache.openHandle('@project-plugin-cache', 'test')).toThrow('@project-plugin-cache requires a plugin context')
  })

  it('@project-cache works without pluginId (local rune)', async () => {
    const cache = createCacheUtils(tmp, null, null, tmp)
    const h = cache.openHandle('@project-cache', 'test')
    await h.set('k', 'local-val')
    expect(await h.get('k')).toBe('local-val')
  })

  // --- Permissions ---

  it('@plugin-cache never triggers permission check', async () => {
    const spy = vi.fn()
    const cache = createCacheUtils(tmp, spy, 'plug@1.0.0', tmp)
    const h = cache.openHandle('@plugin-cache', 'test')
    await h.set('k', 'v')
    await h.get('k')
    expect(spy).not.toHaveBeenCalled()
  })

  it('cache.write checked on set for arbitrary paths', async () => {
    const spy = vi.fn()
    const cache = createCacheUtils(tmp, spy, null, tmp)
    const h = cache.openHandle('./my-dir', 'test')
    try { await h.set('k', 'v') } catch {}
    expect(spy).toHaveBeenCalledWith('cache.write', './my-dir:test')
  })

  it('cache.read checked on get for arbitrary paths', async () => {
    const spy = vi.fn()
    const cache = createCacheUtils(tmp, spy, null, tmp)
    const h = cache.openHandle('./my-dir', 'test')
    try { await h.get('k') } catch {}
    expect(spy).toHaveBeenCalledWith('cache.read', './my-dir:test')
  })

  it('cache.write checked on delete for arbitrary paths', async () => {
    const spy = vi.fn()
    const cache = createCacheUtils(tmp, spy, null, tmp)
    const h = cache.openHandle('./my-dir', 'test')
    try { await h.delete('k') } catch {}
    expect(spy).toHaveBeenCalledWith('cache.write', './my-dir:test')
  })

  it('cache.write checked on clear for arbitrary paths', async () => {
    const spy = vi.fn()
    const cache = createCacheUtils(tmp, spy, null, tmp)
    const h = cache.openHandle('./my-dir', 'test')
    try { await h.clear() } catch {}
    expect(spy).toHaveBeenCalledWith('cache.write', './my-dir:test')
  })

  it('PermissionError thrown by get when cache.read not granted', async () => {
    const checker = makePermissionChecker({ allow: [], deny: [] })
    const cache = createCacheUtils(tmp, checker, null, tmp)
    const h = cache.openHandle('./my-dir', 'test')
    await expect(h.get('k')).rejects.toThrow(PermissionError)
  })

  it('PermissionError thrown by set when cache.write not granted', async () => {
    const checker = makePermissionChecker({ allow: [], deny: [] })
    const cache = createCacheUtils(tmp, checker, null, tmp)
    const h = cache.openHandle('./my-dir', 'test')
    await expect(h.set('k', 'v')).rejects.toThrow(PermissionError)
  })

  it('cache.read granted allows get but not set', async () => {
    const checker = makePermissionChecker({ allow: ['cache.read:./my-dir:test'], deny: [] })
    const cache = createCacheUtils(tmp, checker, null, tmp)
    const h = cache.openHandle('./my-dir', 'test')
    await expect(h.get('k')).resolves.toBe(null)
    await expect(h.set('k', 'v')).rejects.toThrow(PermissionError)
  })

  it('name defaults to "default" in permission token when omitted', async () => {
    const spy = vi.fn()
    const cache = createCacheUtils(tmp, spy, null, tmp)
    const h = cache.openHandle('./my-dir')
    try { await h.get('k') } catch {}
    expect(spy).toHaveBeenCalledWith('cache.read', './my-dir:default')
  })
})
