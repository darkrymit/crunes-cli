import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getCachePluginDir, getCacheProjectDir, getCacheProjectPluginDir,
  cacheBucketKey, upsertCacheBucket, loadCacheBuckets, listCacheBuckets,
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
