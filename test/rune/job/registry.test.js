import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJob, getJob, cleanJobs, listJobs, deleteJob, resolveJobId } from '../../../src/job/registry.js'
import { getProjectKey } from '../../../src/project/index.js'
import { loadProjects } from '../../../src/project/index.js'

const PROJ = '/proj'
const PKEY = getProjectKey(PROJ)
const META = { spawnedBy: 'server', runeKey: 'worker', projectDir: PROJ, args: ['--port', '3000'] }

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

  it('createJob returns a full UUID id and writes a record with full provenance', async () => {
    const { id, projectKey: pk } = await createJob(12345, META)
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(pk).toBe(PKEY)
    const record = await getJob(pk, id)
    expect(record).toMatchObject({ id, pid: 12345, type: 'rune', projectKey: pk, ...META })
    expect(typeof record.startedAt).toBe('string')
  })

  it('getJob returns null for unknown id', async () => {
    expect(await getJob(PKEY, 'no-such-id')).toBeNull()
  })

  it('cleanJobs removes records for dead PIDs', async () => {
    const { id, projectKey: pk } = await createJob(999999999, { ...META })
    await cleanJobs()
    expect(await getJob(pk, id)).toBeNull()
  })

  it('cleanJobs keeps records for alive PIDs', async () => {
    const { id, projectKey: pk } = await createJob(process.pid, { ...META })
    await cleanJobs()
    expect(await getJob(pk, id)).not.toBeNull()
  })

  it('cleanJobs(key) scopes cleanup to one project', async () => {
    const { id: id1, projectKey: pk1 } = await createJob(999999999, { ...META, projectDir: '/proj-a' })
    const { id: id2, projectKey: pk2 } = await createJob(999999999, { ...META, projectDir: '/proj-b' })
    await cleanJobs(pk1)
    expect(await getJob(pk1, id1)).toBeNull()
    expect(await getJob(pk2, id2)).not.toBeNull()
  })

  it('cleanJobs is a no-op when jobs dir does not exist', async () => {
    await expect(cleanJobs()).resolves.toBeUndefined()
  })

  it('createJob upserts projects.json via projects module', async () => {
    await createJob(12345, { ...META })
    const data = await loadProjects()
    expect(data.projects[PKEY]).toBe(PROJ)
  })

  it('listJobs returns all records for a project', async () => {
    const { id, projectKey: pk } = await createJob(process.pid, { ...META })
    const jobs = await listJobs(pk)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].id).toBe(id)
  })

  it('listJobs returns empty array for unknown project key', async () => {
    expect(await listJobs('unknown000000')).toEqual([])
  })

  it('listJobs returns all jobs across all projects when no key given', async () => {
    await createJob(process.pid, { ...META, projectDir: '/proj-a' })
    await createJob(process.pid, { ...META, projectDir: '/proj-b' })
    const jobs = await listJobs()
    expect(jobs).toHaveLength(2)
  })

  it('deleteJob removes the record file', async () => {
    const { id, projectKey: pk } = await createJob(process.pid, { ...META })
    await deleteJob(pk, id)
    expect(await getJob(pk, id)).toBeNull()
  })

  it('deleteJob is a no-op for unknown id', async () => {
    await expect(deleteJob(PKEY, 'no-such-id')).resolves.toBeUndefined()
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
    const { id } = await createJob(process.pid, { spawnedBy: 's', runeKey: 'r', projectDir: '/p', args: [] })
    const jobs = await listJobs()
    expect(resolveJobId(id, jobs)).toBe(id)
  })

  it('resolves by 8-char prefix when unambiguous', async () => {
    const { id } = await createJob(process.pid, { spawnedBy: 's', runeKey: 'r', projectDir: '/p', args: [] })
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
