import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upsertCacheBucket } from '../../../src/cache/index.js'
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

  it('prints "No cache buckets." when no buckets exist', async () => {
    await handler({ projectDir: tmp })
    expect(console.log).toHaveBeenCalledWith('No cache buckets.')
  })

  it('shows global-plugin bucket in listing', async () => {
    const pluginPath = join(tmp, 'cache', 'plugins', 'my-plugin', 'data')
    await upsertCacheBucket(pluginPath, { scope: 'global-plugin', projectId: null, pluginId: 'my-plugin', location: '@global-plugin-cache', name: 'data' })
    await handler({ projectDir: tmp })
    const lines = console.log.mock.calls.map(c => c[0])
    expect(lines.some(l => l.includes('data'))).toBe(true)
  })

  it('prints a table with header columns when buckets exist', async () => {
    const bucketPath = join(tmp, 'cache', 'plugins', 'plug@1.0', 'default')
    await upsertCacheBucket(bucketPath, { scope: 'global-plugin', projectId: null, pluginId: 'plug@1.0', location: '@global-plugin-cache', name: 'default' })
    await handler({ projectDir: tmp })
    const lines = console.log.mock.calls.map(c => c[0])
    expect(lines.some(l => l.includes('KEY'))).toBe(true)
    expect(lines.some(l => l.includes('default'))).toBe(true)
  })

  it('shows local-cache buckets scanned from project dir', async () => {
    const localPath = join(tmp, '.crunes', 'caches', 'project', 'mylocal')
    await mkdir(localPath, { recursive: true })
    await handler({ projectDir: tmp })
    const lines = console.log.mock.calls.map(c => c[0])
    expect(lines.some(l => l.includes('mylocal'))).toBe(true)
  })
})
