import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJob, getJob, cleanJobs, listJobs, deleteJob, resolveJobId } from '../../../src/job/registry.js'
import { loadProjects } from '../../../src/project/index.js'

describe('job registry', () => {
  let tmp

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-jobs-'))
    process.env.CRUNES_STORE = tmp
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    await rm(tmp, { recursive: true, force: true })
  })

  const meta = (tmp) => ({ spawnedBy: 'server', runeKey: 'worker', projectDir: join(tmp, 'proj'), args: ['--port', '3000'] })

  it('createJob returns a full UUID id and writes a record with full provenance', async () => {
    const META = meta(tmp)
    const { id, projectKey: pk } = await createJob(12345, META)
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(typeof pk).toBe('string')
    const record = await getJob(pk, id)
    expect(record).toMatchObject({ id, pid: 12345, type: 'rune', projectKey: pk, ...META })
    expect(typeof record.startedAt).toBe('string')
  })

  it('getJob returns null for unknown id', async () => {
    const { projectKey: pk } = await createJob(process.pid, meta(tmp))
    expect(await getJob(pk, 'no-such-id')).toBeNull()
  })

  it('cleanJobs removes records for dead PIDs', async () => {
    const { id, projectKey: pk } = await createJob(999999999, meta(tmp))
    await cleanJobs()
    expect(await getJob(pk, id)).toBeNull()
  })

  it('cleanJobs keeps records for alive PIDs', async () => {
    const { id, projectKey: pk } = await createJob(process.pid, meta(tmp))
    await cleanJobs()
    expect(await getJob(pk, id)).not.toBeNull()
  })

  it('cleanJobs(key) scopes cleanup to one project', async () => {
    const { id: id1, projectKey: pk1 } = await createJob(999999999, { ...meta(tmp), projectDir: join(tmp, 'proj-a') })
    const { id: id2, projectKey: pk2 } = await createJob(999999999, { ...meta(tmp), projectDir: join(tmp, 'proj-b') })
    await cleanJobs(pk1)
    expect(await getJob(pk1, id1)).toBeNull()
    expect(await getJob(pk2, id2)).not.toBeNull()
  })

  it('cleanJobs is a no-op when jobs dir does not exist', async () => {
    await expect(cleanJobs()).resolves.toBeUndefined()
  })

  it('createJob upserts projects.json via projects module', async () => {
    const META = meta(tmp)
    const { projectKey: pk } = await createJob(12345, META)
    const data = await loadProjects()
    expect(data.projects[pk]).toMatchObject({ path: META.projectDir })
  })

  it('listJobs returns all records for a project', async () => {
    const { id, projectKey: pk } = await createJob(process.pid, meta(tmp))
    const jobs = await listJobs(pk)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].id).toBe(id)
  })

  it('listJobs returns empty array for unknown project key', async () => {
    expect(await listJobs('unknown000000')).toEqual([])
  })

  it('listJobs returns all jobs across all projects when no key given', async () => {
    await createJob(process.pid, { ...meta(tmp), projectDir: join(tmp, 'proj-a') })
    await createJob(process.pid, { ...meta(tmp), projectDir: join(tmp, 'proj-b') })
    const jobs = await listJobs()
    expect(jobs).toHaveLength(2)
  })

  it('deleteJob removes the record file', async () => {
    const { id, projectKey: pk } = await createJob(process.pid, meta(tmp))
    await deleteJob(pk, id)
    expect(await getJob(pk, id)).toBeNull()
  })

  it('deleteJob is a no-op for unknown id', async () => {
    const { projectKey: pk } = await createJob(process.pid, meta(tmp))
    await expect(deleteJob(pk, 'no-such-id')).resolves.toBeUndefined()
  })
})

describe('resolveJobId', () => {
  let tmp

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-jobs-resolve-'))
    process.env.CRUNES_STORE = tmp
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    await rm(tmp, { recursive: true, force: true })
  })

  it('returns exact id when full UUID matches', async () => {
    const { id } = await createJob(process.pid, { spawnedBy: 's', runeKey: 'r', projectDir: tmp, args: [] })
    const jobs = await listJobs()
    expect(resolveJobId(id, jobs)).toBe(id)
  })

  it('resolves by 8-char prefix when unambiguous', async () => {
    const { id } = await createJob(process.pid, { spawnedBy: 's', runeKey: 'r', projectDir: tmp, args: [] })
    const jobs = await listJobs()
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
