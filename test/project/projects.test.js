import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upsertProject, loadProjects, shortHash, getProjectKey } from '../../src/project/index.js'

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

describe('shortHash', () => {
  it('returns 8-char hex string', () => {
    expect(shortHash('hello')).toMatch(/^[0-9a-f]{8}$/)
  })
  it('is deterministic', () => {
    expect(shortHash('abc')).toBe(shortHash('abc'))
  })
  it('differs for different inputs', () => {
    expect(shortHash('abc')).not.toBe(shortHash('def'))
  })
})

describe('getProjectKey', () => {
  let tmp
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-proj-key-')) })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('returns bare 8-char hash when no config and no name arg', () => {
    expect(getProjectKey(tmp)).toMatch(/^[0-9a-f]{8}$/)
  })
  it('returns name-hash when explicit name provided', () => {
    expect(getProjectKey(tmp, 'myapp')).toBe(`myapp-${shortHash(tmp)}`)
  })
  it('reads name from .crunes/config.json when no name arg', async () => {
    await mkdir(join(tmp, '.crunes'), { recursive: true })
    await writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify({ name: 'my-project' }))
    expect(getProjectKey(tmp)).toBe(`my-project-${shortHash(tmp)}`)
  })
  it('explicit name overrides config.json name', async () => {
    await mkdir(join(tmp, '.crunes'), { recursive: true })
    await writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify({ name: 'cfg-name' }))
    expect(getProjectKey(tmp, 'explicit')).toBe(`explicit-${shortHash(tmp)}`)
  })
})
