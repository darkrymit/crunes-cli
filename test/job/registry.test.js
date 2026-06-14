import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tmpDir
beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'crunes-registry-test-'))
  process.env.CRUNES_STORE_PATH = tmpDir
})
afterEach(async () => {
  delete process.env.CRUNES_STORE_PATH
  await rm(tmpDir, { recursive: true, force: true })
})

async function getRegistry() {
  return import('../../src/job/registry.js')
}

describe('jobStdoutPath / jobStderrPath', async () => {
  it('returns paths inside the project job dir', async () => {
    const { jobStdoutPath, jobStderrPath } = await getRegistry()
    const stdout = jobStdoutPath('proj', 'abc')
    const stderr = jobStderrPath('proj', 'abc')
    expect(stdout).toContain('abc.stdout.log')
    expect(stderr).toContain('abc.stderr.log')
    expect(stdout).toContain('proj')
  })
})

describe('jobStdinPath', async () => {
  it('stdin path contains .stdin.log suffix', async () => {
    const { jobStdinPath } = await getRegistry()
    const p = jobStdinPath('myproject', 'job-123')
    expect(p).toMatch(/job-123\.stdin\.log$/)
  })

  it('stdin path is in the same directory as stdout path', async () => {
    const { jobStdoutPath, jobStdinPath } = await getRegistry()
    const stdout = jobStdoutPath('myproject', 'job-123')
    const stdin  = jobStdinPath('myproject', 'job-123')
    expect(stdout.replace('.stdout.log', '')).toBe(stdin.replace('.stdin.log', ''))
  })
})

describe('updateJobPid', async () => {
  it('updates pid on an existing job record', async () => {
    const { createJob, updateJobPid, getJob } = await getRegistry()
    const { id, projectKey } = await createJob(null, { type: 'rune', spawnedBy: 'test', runeKey: 'foo', projectDir: tmpDir, args: [] })
    await updateJobPid(projectKey, id, 9999)
    const record = await getJob(projectKey, id)
    expect(record.pid).toBe(9999)
  })

  it('is a no-op for unknown job ids', async () => {
    const { updateJobPid } = await getRegistry()
    await expect(updateJobPid('no-proj', 'no-id', 1)).resolves.toBeUndefined()
  })
})
