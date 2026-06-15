import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let projectDir
beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'crunes-job-test-'))
})
afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true })
})

async function getRegistry() {
  return import('../../src/job/registry.js')
}

describe('jobStdoutPath / jobStderrPath', async () => {
  it('returns paths inside the project job dir', async () => {
    const { jobStdoutPath, jobStderrPath } = await getRegistry()
    const stdout = jobStdoutPath(projectDir, 'abc')
    const stderr = jobStderrPath(projectDir, 'abc')
    expect(stdout).toContain('abc')
    expect(stdout).toContain('stdout.log')
    expect(stderr).toContain('stderr.log')
    expect(stdout).toContain('.crunes')
  })
})

describe('jobStdinPath', async () => {
  it('stdin path contains .stdin.log suffix', async () => {
    const { jobStdinPath } = await getRegistry()
    const p = jobStdinPath(projectDir, 'job-123')
    expect(p).toMatch(/stdin\.log$/)
  })

  it('stdin path is in the same directory as stdout path', async () => {
    const { jobStdoutPath, jobStdinPath } = await getRegistry()
    const stdout = jobStdoutPath(projectDir, 'job-123')
    const stdin  = jobStdinPath(projectDir, 'job-123')
    expect(stdout.replace('stdout.log', '')).toBe(stdin.replace('stdin.log', ''))
  })
})

describe('createJob / getJob', async () => {
  it('creates a job record and retrieves it', async () => {
    const { createJob, getJob } = await getRegistry()
    const { id } = await createJob(1234, { type: 'rune', spawnedBy: 'test', runeKey: 'foo', projectDir, args: [] })
    const record = await getJob(projectDir, id)
    expect(record.id).toBe(id)
    expect(record.runeKey).toBe('foo')
    expect(record.pid).toBe(1234)
  })

  it('getJob returns null for unknown id', async () => {
    const { getJob } = await getRegistry()
    expect(await getJob(projectDir, 'no-id')).toBeNull()
  })
})

describe('updateJobPid', async () => {
  it('updates pid on an existing job record', async () => {
    const { createJob, updateJobPid, getJob } = await getRegistry()
    const { id } = await createJob(null, { type: 'rune', spawnedBy: 'test', runeKey: 'foo', projectDir, args: [] })
    await updateJobPid(projectDir, id, 9999)
    const record = await getJob(projectDir, id)
    expect(record.pid).toBe(9999)
  })

  it('is a no-op for unknown job ids', async () => {
    const { updateJobPid } = await getRegistry()
    await expect(updateJobPid(projectDir, 'no-id', 1)).resolves.toBeUndefined()
  })
})

describe('listJobs', async () => {
  it('returns [] when no jobs exist', async () => {
    const { listJobs } = await getRegistry()
    expect(await listJobs(projectDir)).toEqual([])
  })

  it('returns all created jobs', async () => {
    const { createJob, listJobs } = await getRegistry()
    await createJob(1, { type: 'rune', spawnedBy: 'test', runeKey: 'foo', projectDir, args: [] })
    await createJob(2, { type: 'rune', spawnedBy: 'test', runeKey: 'bar', projectDir, args: [] })
    const jobs = await listJobs(projectDir)
    expect(jobs).toHaveLength(2)
    expect(jobs.map(j => j.runeKey).sort()).toEqual(['bar', 'foo'])
  })
})

describe('deleteJob', async () => {
  it('removes the job so getJob returns null', async () => {
    const { createJob, deleteJob, getJob } = await getRegistry()
    const { id } = await createJob(1, { type: 'rune', spawnedBy: 'test', runeKey: 'foo', projectDir, args: [] })
    await deleteJob(projectDir, id)
    expect(await getJob(projectDir, id)).toBeNull()
  })
})
