import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upsertSqliteDb } from '../../../src/sqlite/index.js'
import { getProjectKey } from '../../../src/project/index.js'
import { handler } from '../../../src/sqlite/commands/list.js'

const PROJ_KEY = 'abc123def456'

describe('sqlite list handler', () => {
  let tmp
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-sqlite-cmd-'))
    process.env.CRUNES_STORE = tmp
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    vi.restoreAllMocks()
    await rm(tmp, { recursive: true, force: true })
  })

  it('prints "No SQLite databases." when index is empty', async () => {
    await handler({ projectDir: tmp, global: true })
    expect(console.log).toHaveBeenCalledWith('No SQLite databases.')
  })

  it('prints a table with header and a row per database', async () => {
    const dbPath = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'notes.sqlite')
    await upsertSqliteDb(dbPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'notes' })
    await handler({ projectDir: tmp, global: true })
    const lines = console.log.mock.calls.map(c => c[0])
    expect(lines.some(l => l.includes('KEY'))).toBe(true)
    expect(lines.some(l => l.includes('notes'))).toBe(true)
    expect(lines.some(l => l.includes('project'))).toBe(true)
  })

  it('scopes to current project when global: false', async () => {
    const projKey = getProjectKey(tmp)
    const p1 = join(tmp, 'sqlite', 'projects', projKey, 'mine.sqlite')
    const p2 = join(tmp, 'sqlite', 'projects', 'other-key', 'theirs.sqlite')
    await upsertSqliteDb(p1, { scope: 'project', projectKey: projKey, pluginId: null, location: '@project-sqlite', name: 'mine' })
    await upsertSqliteDb(p2, { scope: 'project', projectKey: 'other-key', pluginId: null, location: '@project-sqlite', name: 'theirs' })
    await handler({ projectDir: tmp, global: false })
    const lines = console.log.mock.calls.map(c => c[0])
    expect(lines.some(l => l.includes('mine'))).toBe(true)
    expect(lines.some(l => l.includes('theirs'))).toBe(false)
  })
})
