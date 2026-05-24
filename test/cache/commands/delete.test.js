import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upsertCacheBucket, loadCacheBuckets } from '../../../src/cache/index.js'
import { handler } from '../../../src/cache/commands/delete.js'

const PROJ_KEY = 'abc123def456'

describe('cache delete handler', () => {
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

  it('deletes the bucket directory and prints confirmation (yes: true)', async () => {
    const bucketPath = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    await mkdir(bucketPath, { recursive: true })
    await upsertCacheBucket(bucketPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'default' })
    const { buckets } = await loadCacheBuckets()
    const id = Object.keys(buckets)[0]
    await handler({ id, yes: true, projectDir: tmp, global: true })
    await expect(access(bucketPath)).rejects.toThrow()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Deleted cache bucket'))
    expect(Object.keys((await loadCacheBuckets()).buckets)).toHaveLength(0)
  })

  it('exits 1 on unknown id', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(handler({ id: 'nope', yes: true, projectDir: tmp, global: true })).rejects.toThrow('exit')
    exitSpy.mockRestore()
  })

  it('exits 1 when id belongs to a different project (no -g)', async () => {
    const bucketPath = join(tmp, 'caches', 'projects', 'other-key', 'def')
    await mkdir(bucketPath, { recursive: true })
    await upsertCacheBucket(bucketPath, { scope: 'project', projectKey: 'other-key', pluginId: null, location: '@project-cache', name: 'def' })
    const { buckets } = await loadCacheBuckets()
    const id = Object.keys(buckets)[0]
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(handler({ id, yes: true, projectDir: tmp, global: false })).rejects.toThrow('exit')
    exitSpy.mockRestore()
  })
})
