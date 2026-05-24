import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createJob, getJob } from '../../../src/job/registry.js'
import { getProjectKey } from '../../../src/project/index.js'
import { handler } from '../../../src/job/commands/kill.js'

const META = { spawnedBy: 'server', runeKey: 'worker', projectDir: null, args: [] }

describe('jobs kill handler', () => {
  let tmp

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-jobs-kill-'))
    process.env.CRUNES_STORE = tmp
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    await rm(tmp, { recursive: true, force: true })
  })

  it('deletes the job record and prints confirmation', async () => {
    const { id } = await createJob(process.pid, { ...META, projectDir: '/proj' })
    const logs = []
    vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')))
    vi.spyOn(process, 'kill').mockImplementation(() => {})
    await handler({ id, projectDir: '/proj', global: false })
    vi.restoreAllMocks()
    expect(await getJob(getProjectKey('/proj'), id)).toBeNull()
    expect(logs.join('\n')).toMatch(/worker/)
  })

  it('kills by 8-char prefix', async () => {
    const { id } = await createJob(process.pid, { ...META, projectDir: '/proj' })
    vi.spyOn(process, 'kill').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await handler({ id: id.slice(0, 8), projectDir: '/proj', global: false })
    vi.restoreAllMocks()
    expect(await getJob(getProjectKey('/proj'), id)).toBeNull()
  })

  it('exits 1 when job not found', async () => {
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      handler({ id: 'no-such-id', projectDir: '/proj', global: false })
    ).rejects.toThrow('exit')
    vi.restoreAllMocks()
  })
})
