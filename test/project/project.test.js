import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upsertProject, loadProjects, shortHash, getProjectKey, ensureProjectIdentity } from '../../src/project/index.js'

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

  it('upsertProject creates projects.json with object entry', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'crunes-proj-'))
    await mkdir(join(projectDir, '.crunes'), { recursive: true })
    await writeFile(join(projectDir, '.crunes', 'project.local.json'), JSON.stringify({ id: 'test-abc12345', alias: 'myproject' }))
    try {
      await upsertProject('test-abc12345', projectDir)
      const raw = await readFile(join(tmp, 'projects.json'), 'utf8')
      const data = JSON.parse(raw)
      expect(data.format).toBe('1')
      expect(data.projects['test-abc12345']).toMatchObject({ path: projectDir, alias: 'myproject' })
      expect(data.projects['test-abc12345'].lastActiveAt).toBeTruthy()
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  it('upsertProject accumulates multiple projects', async () => {
    const dirA = await mkdtemp(join(tmpdir(), 'crunes-proj-a-'))
    const dirB = await mkdtemp(join(tmpdir(), 'crunes-proj-b-'))
    await mkdir(join(dirA, '.crunes'), { recursive: true })
    await mkdir(join(dirB, '.crunes'), { recursive: true })
    await writeFile(join(dirA, '.crunes', 'project.local.json'), JSON.stringify({ id: 'aaa111', alias: 'proj-a' }))
    await writeFile(join(dirB, '.crunes', 'project.local.json'), JSON.stringify({ id: 'bbb222', alias: 'proj-b' }))
    try {
      await upsertProject('aaa111', dirA)
      await upsertProject('bbb222', dirB)
      const data = await loadProjects()
      expect(Object.keys(data.projects)).toHaveLength(2)
      expect(data.projects['aaa111']).toMatchObject({ path: dirA })
      expect(data.projects['bbb222']).toMatchObject({ path: dirB })
    } finally {
      await rm(dirA, { recursive: true, force: true })
      await rm(dirB, { recursive: true, force: true })
    }
  })

  it('upsertProject is idempotent — same id overwrites same entry', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'crunes-proj-'))
    await mkdir(join(projectDir, '.crunes'), { recursive: true })
    await writeFile(join(projectDir, '.crunes', 'project.local.json'), JSON.stringify({ id: 'abc123', alias: 'proj' }))
    try {
      await upsertProject('abc123', projectDir)
      await upsertProject('abc123', projectDir)
      const data = await loadProjects()
      expect(Object.keys(data.projects)).toHaveLength(1)
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
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

  it('returns stable id from project.local.json when no name arg', async () => {
    await mkdir(join(tmp, '.crunes'), { recursive: true })
    await writeFile(join(tmp, '.crunes', 'project.local.json'), JSON.stringify({ id: 'stable-id-001', alias: 'myapp' }))
    const key = await getProjectKey(tmp)
    expect(key).toBe('stable-id-001')
  })
  it('returns name-hash when explicit name provided', async () => {
    expect(await getProjectKey(tmp, 'myapp')).toBe(`myapp-${shortHash(tmp)}`)
  })
  it('returns hash-only when no project.local.json and no name arg', async () => {
    expect(await getProjectKey(tmp)).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('ensureProjectIdentity', () => {
  let tmp
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-identity-')) })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('creates project.local.json on first call with id and alias', async () => {
    const identity = await ensureProjectIdentity(tmp)
    expect(identity.id).toBeTruthy()
    expect(identity.alias).toBeTruthy()
    const raw = await readFile(join(tmp, '.crunes', 'project.local.json'), 'utf8')
    const parsed = JSON.parse(raw)
    expect(parsed.id).toBe(identity.id)
    expect(parsed.alias).toBe(identity.alias)
  })

  it('id has basename prefix', async () => {
    const identity = await ensureProjectIdentity(tmp)
    const baseName = tmp.split(/[\\/]/).at(-1).slice(0, 15)
    expect(identity.id.startsWith(baseName)).toBe(true)
  })

  it('second call returns the same id (stability)', async () => {
    const first = await ensureProjectIdentity(tmp)
    const second = await ensureProjectIdentity(tmp)
    expect(second.id).toBe(first.id)
    expect(second.alias).toBe(first.alias)
  })

  it('reads alias from config.json name when no project.local.json exists', async () => {
    await mkdir(join(tmp, '.crunes'), { recursive: true })
    await writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify({ name: 'my-cool-app' }))
    const identity = await ensureProjectIdentity(tmp)
    expect(identity.alias).toBe('my-cool-app')
  })

  it('falls back to dir basename when neither config nor project.local.json present', async () => {
    const identity = await ensureProjectIdentity(tmp)
    const basename = tmp.split(/[\\/]/).at(-1)
    expect(identity.alias).toBe(basename)
  })

  it('does not overwrite existing project.local.json', async () => {
    await mkdir(join(tmp, '.crunes'), { recursive: true })
    await writeFile(
      join(tmp, '.crunes', 'project.local.json'),
      JSON.stringify({ id: 'fixed-id-xyz', alias: 'fixed-alias' })
    )
    const identity = await ensureProjectIdentity(tmp)
    expect(identity.id).toBe('fixed-id-xyz')
    expect(identity.alias).toBe('fixed-alias')
  })
})
