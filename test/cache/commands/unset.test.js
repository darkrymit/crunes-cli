import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upsertCacheBucket, loadCacheBuckets } from '../../../src/cache/index.js'
import { handler } from '../../../src/cache/commands/unset.js'

const PROJ_KEY = 'abc123def456'

describe('cache unset handler', () => {
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

  it('deletes the key file and prints confirmation', async () => {
    const bucketPath = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    await mkdir(bucketPath, { recursive: true })
    await writeFile(join(bucketPath, 'mykey.json'), JSON.stringify({ value: 1, expiresAt: null }))
    await upsertCacheBucket(bucketPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'default' })
    const { buckets } = await loadCacheBuckets()
    const id = Object.keys(buckets)[0]
    await handler({ id, key: 'mykey' })
    await expect(access(join(bucketPath, 'mykey.json'))).rejects.toThrow()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Removed key "mykey"'))
  })

  it('exits 1 when key file does not exist', async () => {
    const bucketPath = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    await mkdir(bucketPath, { recursive: true })
    await upsertCacheBucket(bucketPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-cache', name: 'default' })
    const { buckets } = await loadCacheBuckets()
    const id = Object.keys(buckets)[0]
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(handler({ id, key: 'ghost' })).rejects.toThrow('exit')
    exitSpy.mockRestore()
  })
})
