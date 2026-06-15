import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJob, getJob, cleanJobs, listJobs, deleteJob, resolveJobId } from '../../../src/job/registry.js'

describe('job registry', () => {
  let tmp, projectDir

  beforeEach(async () => {
    tmp        = await mkdtemp(join(tmpdir(), 'crunes-jobs-'))
    projectDir = join(tmp, 'proj')
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  it('createJob returns a full UUID id and writes a record with full provenance', async () => {
    const { id } = await createJob(12345, { spawnedBy: 'server', runeKey: 'worker', projectDir, args: ['--port', '3000'] })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    const record = await getJob(projectDir, id)
    expect(record).toMatchObject({ id, pid: 12345, type: 'rune', projectDir, spawnedBy: 'server', runeKey: 'worker' })
    expect(typeof record.startedAt).toBe('string')
  })

  it('getJob returns null for unknown id', async () => {
    await createJob(process.pid, { spawnedBy: 'test', runeKey: 'r', projectDir, args: [] })
    expect(await getJob(projectDir, 'no-such-id')).toBeNull()
  })

  it('cleanJobs removes records for dead PIDs', async () => {
    const { id } = await createJob(999999999, { spawnedBy: 'test', runeKey: 'r', projectDir, args: [] })
    await cleanJobs(projectDir)
    expect(await getJob(projectDir, id)).toBeNull()
  })

  it('cleanJobs keeps records for alive PIDs', async () => {
    const { id } = await createJob(process.pid, { spawnedBy: 'test', runeKey: 'r', projectDir, args: [] })
    await cleanJobs(projectDir)
    expect(await getJob(projectDir, id)).not.toBeNull()
  })

  it('cleanJobs is a no-op when jobs dir does not exist', async () => {
    const nonexistent = join(tmp, 'no-such-proj')
    await expect(cleanJobs(nonexistent)).resolves.toBeUndefined()
  })

  it('listJobs returns all records for a project', async () => {
    const { id } = await createJob(process.pid, { spawnedBy: 'test', runeKey: 'r', projectDir, args: [] })
    const jobs = await listJobs(projectDir)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].id).toBe(id)
  })

  it('listJobs returns empty array when no jobs exist', async () => {
    expect(await listJobs(projectDir)).toEqual([])
  })

  it('deleteJob removes the job directory', async () => {
    const { id } = await createJob(process.pid, { spawnedBy: 'test', runeKey: 'r', projectDir, args: [] })
    await deleteJob(projectDir, id)
    expect(await getJob(projectDir, id)).toBeNull()
  })

  it('deleteJob is a no-op for unknown id', async () => {
    await expect(deleteJob(projectDir, 'no-such-id')).resolves.toBeUndefined()
  })
})

describe('resolveJobId', () => {
  let tmp, projectDir

  beforeEach(async () => {
    tmp        = await mkdtemp(join(tmpdir(), 'crunes-jobs-resolve-'))
    projectDir = tmp
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  it('returns exact id when full UUID matches', async () => {
    const { id } = await createJob(process.pid, { spawnedBy: 's', runeKey: 'r', projectDir, args: [] })
    const jobs = await listJobs(projectDir)
    expect(resolveJobId(id, jobs)).toBe(id)
  })

  it('resolves by 8-char prefix when unambiguous', async () => {
    const { id } = await createJob(process.pid, { spawnedBy: 's', runeKey: 'r', projectDir, args: [] })
    const jobs = await listJobs(projectDir)
    expect(resolveJobId(id.slice(0, 8), jobs)).toBe(id)
  })

  it('throws on no match', () => {
    expect(() => resolveJobId('xxxxxxxx', [])).toThrow(/No job matching/)
  })

  it('throws on ambiguous prefix', () => {
    const fakeJobs = [
      { id: 'aabbcc11-0000-0000-0000-000000000000' },
      { id: 'aabbcc22-0000-0000-0000-000000000000' },
    ]
    expect(() => resolveJobId('aabbcc', fakeJobs)).toThrow(/Ambiguous id/)
  })
})
