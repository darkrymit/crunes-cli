import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upsertSqliteDb, loadSqliteDbs } from '../../../src/sqlite/index.js'
import { handler } from '../../../src/sqlite/commands/delete.js'

const PROJ_KEY = 'abc123def456'

describe('sqlite delete handler', () => {
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

  it('deletes the .sqlite file and deregisters (yes: true)', async () => {
    const dbPath = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'notes.sqlite')
    await mkdir(join(tmp, 'sqlite', 'projects', PROJ_KEY), { recursive: true })
    await writeFile(dbPath, '')
    await upsertSqliteDb(dbPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'notes' })
    const { databases } = await loadSqliteDbs()
    const id = Object.keys(databases)[0]
    await handler({ id, yes: true })
    await expect(access(dbPath)).rejects.toThrow()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Deleted SQLite database'))
    expect(Object.keys((await loadSqliteDbs()).databases)).toHaveLength(0)
  })

  it('exits 1 on unknown id', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(handler({ id: 'nope', yes: true })).rejects.toThrow('exit')
    exitSpy.mockRestore()
  })
})
