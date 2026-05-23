import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getCachePluginDir, getCacheProjectDir, getCacheProjectPluginDir,
  cacheBucketKey, upsertCacheBucket, loadCacheBuckets, listCacheBuckets,
  resolveKey, clearCacheBucket, deleteCacheKey, deleteCacheBucket,
} from '../../src/cache/index.js'

const PLUGIN_ID  = 'my-plugin@1.0.0'
const PROJ_KEY   = 'abc123def456'

describe('cache path helpers', () => {
  let tmp
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-cache-')); process.env.CRUNES_STORE = tmp })
  afterEach(async () => { delete process.env.CRUNES_STORE; await rm(tmp, { recursive: true, force: true }) })

  it('getCachePluginDir', () => {
    expect(getCachePluginDir(PLUGIN_ID)).toBe(join(tmp, 'caches', 'plugins', PLUGIN_ID))
  })
  it('getCacheProjectDir', () => {
    expect(getCacheProjectDir(PROJ_KEY)).toBe(join(tmp, 'caches', 'projects', PROJ_KEY))
  })
  it('getCacheProjectPluginDir', () => {
    expect(getCacheProjectPluginDir(PROJ_KEY, PLUGIN_ID)).toBe(
      join(tmp, 'caches', 'project-plugins', PROJ_KEY, PLUGIN_ID)
    )
  })
})

describe('cache index', () => {
  let tmp
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-cache-')); process.env.CRUNES_STORE = tmp })
  afterEach(async () => { delete process.env.CRUNES_STORE; await rm(tmp, { recursive: true, force: true }) })

  it('loadCacheBuckets returns empty structure when file missing', async () => {
    expect(await loadCacheBuckets()).toEqual({ format: '1', buckets: {} })
  })

  it('cacheBucketKey produces stable <name>-<12hexchars> format', () => {
    const key = cacheBucketKey('default', '/some/path')
    expect(key).toMatch(/^default-[0-9a-f]{12}$/)
    expect(cacheBucketKey('default', '/some/path')).toBe(cacheBucketKey('default', '/some/path'))
  })

  it('upsertCacheBucket creates cache.json with correct entry', async () => {
    const bucketPath = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    await upsertCacheBucket(bucketPath, {
      scope: 'project', projectKey: PROJ_KEY, pluginId: null,
      location: '@project-cache', name: 'default',
    })
    const data = await loadCacheBuckets()
    const entries = Object.values(data.buckets)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      path: bucketPath, scope: 'project', projectKey: PROJ_KEY,
      pluginId: null, location: '@project-cache', name: 'default',
    })
    expect(typeof entries[0].firstSeenAt).toBe('string')
  })

  it('upsertCacheBucket preserves firstSeenAt on re-upsert', async () => {
    const bucketPath = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    const meta = { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'default' }
    await upsertCacheBucket(bucketPath, meta)
    const first = await loadCacheBuckets()
    const key = Object.keys(first.buckets)[0]
    const firstSeenAt = first.buckets[key].firstSeenAt
    await upsertCacheBucket(bucketPath, meta)
    const second = await loadCacheBuckets()
    expect(second.buckets[key].firstSeenAt).toBe(firstSeenAt)
  })

  it('upsertCacheBucket accumulates multiple buckets', async () => {
    await upsertCacheBucket(join(tmp, 'caches', 'projects', PROJ_KEY, 'a'), {
      scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'a',
    })
    await upsertCacheBucket(join(tmp, 'caches', 'projects', PROJ_KEY, 'b'), {
      scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'b',
    })
    expect(Object.keys((await loadCacheBuckets()).buckets)).toHaveLength(2)
  })

  it('listCacheBuckets returns array with key field', async () => {
    const bucketPath = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    await upsertCacheBucket(bucketPath, {
      scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'default',
    })
    const list = await listCacheBuckets()
    expect(list).toHaveLength(1)
    expect(list[0].key).toMatch(/^default-[0-9a-f]{12}$/)
    expect(list[0].path).toBe(bucketPath)
  })
})

describe('cache index — management operations', () => {
  let tmp
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-cache-')); process.env.CRUNES_STORE = tmp })
  afterEach(async () => { delete process.env.CRUNES_STORE; await rm(tmp, { recursive: true, force: true }) })

  // resolveKey
  it('resolveKey returns exact key when it exists', async () => {
    const p = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    await upsertCacheBucket(p, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'default' })
    const data = await loadCacheBuckets()
    const key = Object.keys(data.buckets)[0]
    expect(resolveKey(key, data.buckets)).toBe(key)
  })

  it('resolveKey matches by prefix', async () => {
    const p = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    await upsertCacheBucket(p, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'default' })
    const data = await loadCacheBuckets()
    const key = Object.keys(data.buckets)[0]
    expect(resolveKey(key.slice(0, 10), data.buckets)).toBe(key)
  })

  it('resolveKey throws on no match', async () => {
    expect(() => resolveKey('nope', {})).toThrow('No cache bucket matching "nope".')
  })

  it('resolveKey throws on ambiguous prefix', async () => {
    const p1 = join(tmp, 'caches', 'projects', PROJ_KEY, 'a')
    const p2 = join(tmp, 'caches', 'projects', PROJ_KEY, 'b')
    await upsertCacheBucket(p1, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'a' })
    await upsertCacheBucket(p2, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'b' })
    const data = await loadCacheBuckets()
    expect(() => resolveKey('', data.buckets)).toThrow('Ambiguous')
  })

  // clearCacheBucket
  it('clearCacheBucket removes expired key files and returns count', async () => {
    const { writeFile: wf, mkdir: mk } = await import('node:fs/promises')
    const bucketPath = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    await mk(bucketPath, { recursive: true })
    await wf(join(bucketPath, 'expired.json'), JSON.stringify({ value: 1, expiresAt: Date.now() - 1000 }))
    await wf(join(bucketPath, 'live.json'), JSON.stringify({ value: 2, expiresAt: Date.now() + 60000 }))
    await wf(join(bucketPath, 'noexpiry.json'), JSON.stringify({ value: 3, expiresAt: null }))
    await upsertCacheBucket(bucketPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'default' })
    const data = await loadCacheBuckets()
    const key = Object.keys(data.buckets)[0]
    const result = await clearCacheBucket(key)
    expect(result.removed).toBe(1)
    expect(result.name).toBe('default')
    const { readdir: rd } = await import('node:fs/promises')
    const remaining = await rd(bucketPath)
    expect(remaining).not.toContain('expired.json')
    expect(remaining).toContain('live.json')
    expect(remaining).toContain('noexpiry.json')
  })

  it('clearCacheBucket returns 0 when dir does not exist', async () => {
    const bucketPath = join(tmp, 'caches', 'projects', PROJ_KEY, 'ghost')
    await upsertCacheBucket(bucketPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'ghost' })
    const data = await loadCacheBuckets()
    const key = Object.keys(data.buckets)[0]
    const result = await clearCacheBucket(key)
    expect(result.removed).toBe(0)
  })

  // deleteCacheKey
  it('deleteCacheKey removes the key file', async () => {
    const { writeFile: wf, mkdir: mk, access } = await import('node:fs/promises')
    const bucketPath = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    await mk(bucketPath, { recursive: true })
    await wf(join(bucketPath, 'mykey.json'), JSON.stringify({ value: 42, expiresAt: null }))
    await upsertCacheBucket(bucketPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'default' })
    const data = await loadCacheBuckets()
    const key = Object.keys(data.buckets)[0]
    await deleteCacheKey(key, 'mykey')
    await expect(access(join(bucketPath, 'mykey.json'))).rejects.toThrow()
  })

  it('deleteCacheKey throws when key file does not exist', async () => {
    const { mkdir: mk } = await import('node:fs/promises')
    const bucketPath = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    await mk(bucketPath, { recursive: true })
    await upsertCacheBucket(bucketPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'default' })
    const data = await loadCacheBuckets()
    const key = Object.keys(data.buckets)[0]
    await expect(deleteCacheKey(key, 'missing')).rejects.toThrow('Key "missing" not found')
  })

  // deleteCacheBucket
  it('deleteCacheBucket removes dir and deregisters from cache.json', async () => {
    const { mkdir: mk, access } = await import('node:fs/promises')
    const bucketPath = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    await mk(bucketPath, { recursive: true })
    await upsertCacheBucket(bucketPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'default' })
    const data = await loadCacheBuckets()
    const key = Object.keys(data.buckets)[0]
    const result = await deleteCacheBucket(key)
    expect(result.name).toBe('default')
    await expect(access(bucketPath)).rejects.toThrow()
    expect(Object.keys((await loadCacheBuckets()).buckets)).toHaveLength(0)
  })
})
