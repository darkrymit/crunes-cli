import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upsertProject, loadProjects } from '../../src/project/index.js'

describe('projects index', () => {
  let tmp

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-projects-'))
    process.env.CRUNES_STORE = tmp
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    await rm(tmp, { recursive: true, force: true })
  })

  it('loadProjects returns empty structure when file does not exist', async () => {
    const data = await loadProjects()
    expect(data).toEqual({ format: '1', projects: {} })
  })

  it('upsertProject creates projects.json with correct format', async () => {
    await upsertProject('abc123', '/home/user/myproject')
    const raw = await readFile(join(tmp, 'projects.json'), 'utf8')
    const data = JSON.parse(raw)
    expect(data.format).toBe('1')
    expect(data.projects['abc123']).toBe('/home/user/myproject')
  })

  it('upsertProject accumulates multiple projects', async () => {
    await upsertProject('aaa111', '/proj-a')
    await upsertProject('bbb222', '/proj-b')
    const data = await loadProjects()
    expect(Object.keys(data.projects)).toHaveLength(2)
    expect(data.projects['aaa111']).toBe('/proj-a')
    expect(data.projects['bbb222']).toBe('/proj-b')
  })

  it('upsertProject is idempotent — same key overwrites same value', async () => {
    await upsertProject('abc123', '/proj')
    await upsertProject('abc123', '/proj')
    const data = await loadProjects()
    expect(Object.keys(data.projects)).toHaveLength(1)
  })
})
