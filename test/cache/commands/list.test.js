import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upsertCacheBucket } from '../../../src/cache/index.js'
import { getProjectKey } from '../../../src/project/index.js'
import { handler } from '../../../src/cache/commands/list.js'

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

  it('prints "No cache buckets." when project has no buckets', async () => {
    await handler({ projectDir: tmp, global: false })
    expect(console.log).toHaveBeenCalledWith('No cache buckets.')
  })

  it('project-scoped: shows own bucket, hides other-project bucket', async () => {
    const myKey = getProjectKey(tmp)
    const myPath = join(tmp, 'caches', 'projects', myKey, 'default')
    await upsertCacheBucket(myPath, { scope: 'project', projectKey: myKey, pluginId: null, location: '@project-cache', name: 'default' })
    const otherPath = join(tmp, 'caches', 'projects', 'other-key', 'other')
    await upsertCacheBucket(otherPath, { scope: 'project', projectKey: 'other-key', pluginId: null, location: '@project-cache', name: 'other' })
    await handler({ projectDir: tmp, global: false })
    const lines = console.log.mock.calls.map(c => c[0])
    expect(lines.some(l => l.includes('default'))).toBe(true)
    expect(lines.some(l => l.includes('other'))).toBe(false)
  })

  it('project-scoped: hides scope:plugin entries', async () => {
    const pluginPath = join(tmp, 'caches', 'plugins', 'my-plugin', 'data')
    await upsertCacheBucket(pluginPath, { scope: 'plugin', projectKey: null, pluginId: 'my-plugin', location: '@plugin-cache', name: 'data' })
    await handler({ projectDir: tmp, global: false })
    expect(console.log).toHaveBeenCalledWith('No cache buckets.')
  })

  it('-g: shows all buckets including other projects', async () => {
    const p1 = join(tmp, 'caches', 'projects', 'proj-a', 'a')
    const p2 = join(tmp, 'caches', 'projects', 'proj-b', 'b')
    await upsertCacheBucket(p1, { scope: 'project', projectKey: 'proj-a', pluginId: null, location: '@project-cache', name: 'a' })
    await upsertCacheBucket(p2, { scope: 'project', projectKey: 'proj-b', pluginId: null, location: '@project-cache', name: 'b' })
    await handler({ projectDir: tmp, global: true })
    const lines = console.log.mock.calls.map(c => c[0])
    expect(lines.some(l => l.includes('a'))).toBe(true)
    expect(lines.some(l => l.includes('b'))).toBe(true)
  })

  it('prints a table with header columns when buckets exist', async () => {
    const myKey = getProjectKey(tmp)
    const bucketPath = join(tmp, 'caches', 'projects', myKey, 'default')
    await upsertCacheBucket(bucketPath, { scope: 'project', projectKey: myKey, pluginId: null, location: '@project-cache', name: 'default' })
    await handler({ projectDir: tmp, global: false })
    const lines = console.log.mock.calls.map(c => c[0])
    expect(lines.some(l => l.includes('KEY'))).toBe(true)
    expect(lines.some(l => l.includes('default'))).toBe(true)
    expect(lines.some(l => l.includes('project'))).toBe(true)
  })
})
