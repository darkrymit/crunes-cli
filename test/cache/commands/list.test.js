import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upsertCacheBucket } from '../../../src/cache/index.js'
import { handler } from '../../../src/cache/commands/list.js'

const PROJ_KEY = 'abc123def456'

describe('cache list handler', () => {
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

  it('prints "No cache buckets." when index is empty', async () => {
    await handler()
    expect(console.log).toHaveBeenCalledWith('No cache buckets.')
  })

  it('prints a table with header and a row per bucket', async () => {
    const bucketPath = join(tmp, 'caches', 'projects', PROJ_KEY, 'default')
    await upsertCacheBucket(bucketPath, {
      scope: 'project', projectKey: PROJ_KEY, pluginId: null,
      location: '@project-cache', name: 'default',
    })
    await handler()
    const lines = console.log.mock.calls.map(c => c[0])
    expect(lines.some(l => l.includes('KEY'))).toBe(true)
    expect(lines.some(l => l.includes('default'))).toBe(true)
    expect(lines.some(l => l.includes('project'))).toBe(true)
  })
})
