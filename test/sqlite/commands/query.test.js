import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { upsertSqliteDb, loadSqliteDbs } from '../../../src/sqlite/index.js'
import { handler } from '../../../src/sqlite/commands/query.js'

const PROJ_KEY = 'abc123def456'

describe('sqlite query handler', () => {
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

  async function makeDb(name = 'notes') {
    const dbPath = join(tmp, 'sqlite', 'projects', PROJ_KEY, `${name}.sqlite`)
    await mkdir(join(tmp, 'sqlite', 'projects', PROJ_KEY), { recursive: true })
    const db = new Database(dbPath)
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    db.exec("INSERT INTO t VALUES (1, 'hello')")
    db.close()
    await upsertSqliteDb(dbPath, { scope: 'global-project', projectId: PROJ_KEY, pluginId: null, location: '@global-project-sqlite', name })
    const { databases } = await loadSqliteDbs()
    return Object.keys(databases)[0]
  }

  it('prints column headers and data rows', async () => {
    const id = await makeDb()
    await handler({ id, sql: 'SELECT * FROM t', projectDir: tmp, global: true })
    const lines = console.log.mock.calls.map(c => c[0])
    expect(lines.some(l => l.includes('id') && l.includes('val'))).toBe(true)
    expect(lines.some(l => l.includes('hello'))).toBe(true)
  })

  it('prints "No rows." when query returns nothing', async () => {
    const id = await makeDb()
    await handler({ id, sql: 'SELECT * FROM t WHERE id = 999', projectDir: tmp, global: true })
    expect(console.log).toHaveBeenCalledWith('No rows.')
  })

  it('exits 1 on unknown id', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(handler({ id: 'nope', sql: 'SELECT 1', projectDir: tmp, global: true })).rejects.toThrow('exit')
    exitSpy.mockRestore()
  })

  it('rejects cross-project query when global: false', async () => {
    const id = await makeDb()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(handler({ id, sql: 'SELECT * FROM t', projectDir: tmp, global: false })).rejects.toThrow('exit')
    exitSpy.mockRestore()
  })
})
