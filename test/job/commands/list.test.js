import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createJob } from '../../../src/job/registry.js'
import { handler } from '../../../src/job/commands/list.js'

const META = { spawnedBy: 'server', runeKey: 'worker', projectDir: null, args: [] }

describe('jobs list handler', () => {
  let tmp

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-jobs-list-'))
    process.env.CRUNES_STORE = tmp
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    await rm(tmp, { recursive: true, force: true })
  })

  it('prints "No background jobs." when project has no jobs', async () => {
    const logs = []
    vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')))
    await handler({ projectDir: '/proj', global: false })
    vi.restoreAllMocks()
    expect(logs.join('\n')).toMatch(/no background jobs/i)
  })

  it('prints job rows containing rune key and spawned-by', async () => {
    await createJob(process.pid, { ...META, projectDir: '/proj' })
    const logs = []
    vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')))
    await handler({ projectDir: '/proj', global: false })
    vi.restoreAllMocks()
    const out = logs.join('\n')
    expect(out).toMatch(/worker/)
    expect(out).toMatch(/server/)
  })

  it('--global lists jobs from all projects and shows PROJECT column', async () => {
    await createJob(process.pid, { ...META, projectDir: '/proj-a' })
    await createJob(process.pid, { ...META, projectDir: '/proj-b' })
    const logs = []
    vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')))
    await handler({ projectDir: '/proj-a', global: true })
    vi.restoreAllMocks()
    const out = logs.join('\n')
    expect(out).toMatch(/proj-a/)
    expect(out).toMatch(/proj-b/)
  })
})
