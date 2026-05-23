import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upsertCacheBucket, loadCacheBuckets } from '../../../src/cache/index.js'
import { handler } from '../../../src/cache/commands/clear.js'

const PROJ_KEY = 'abc123def456'

describe('cache clear handler', () => {
  let tmp
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-cache-cmd-'))
    process.env.CRUNES_STORE = tmp
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    vi.restoreAllMocks()
    await rm(tmp, { recursive: true, force: true })
  })

  it('removes expired keys and prints count', async () => {
    const bucketPath = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    await mkdir(bucketPath, { recursive: true })
    await writeFile(join(bucketPath, 'old.json'), JSON.stringify({ value: 1, expiresAt: Date.now() - 5000 }))
    await writeFile(join(bucketPath, 'fresh.json'), JSON.stringify({ value: 2, expiresAt: Date.now() + 60000 }))
    await upsertCacheBucket(bucketPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'default' })
    const { buckets } = await loadCacheBuckets()
    const id = Object.keys(buckets)[0]
    await handler({ id })
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Removed 1 expired key'))
  })

  it('reports no expired keys when none found', async () => {
    const bucketPath = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    await mkdir(bucketPath, { recursive: true })
    await upsertCacheBucket(bucketPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'default' })
    const { buckets } = await loadCacheBuckets()
    const id = Object.keys(buckets)[0]
    await handler({ id })
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No expired keys'))
  })

  it('exits 1 on unknown id', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(handler({ id: 'bogus' })).rejects.toThrow('exit')
    exitSpy.mockRestore()
  })
})
