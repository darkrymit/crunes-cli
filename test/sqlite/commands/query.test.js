import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { upsertSqliteDb, loadSqliteDbs } from '../../../src/sqlite/index.js'
import { handler } from '../../../src/sqlite/commands/query.js'

const PLUGIN_ID = 'my-plugin@1.0.0'

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

  async function makeDb() {
    const dbPath = join(tmp, 'sqlite', 'plugins', PLUGIN_ID, 'notes.sqlite')
    await mkdir(join(tmp, 'sqlite', 'plugins', PLUGIN_ID), { recursive: true })
    const db = new Database(dbPath)
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    db.exec("INSERT INTO t VALUES (1, 'hello')")
    db.close()
    await upsertSqliteDb(dbPath, { scope: 'global-plugin', projectId: null, pluginId: PLUGIN_ID, location: '@global-plugin-sqlite', name: 'notes' })
    const { databases } = await loadSqliteDbs()
    return Object.keys(databases)[0]
  }

  it('prints column headers and data rows', async () => {
    const id = await makeDb()
    await handler({ id, sql: 'SELECT * FROM t', projectDir: tmp })
    const lines = console.log.mock.calls.map(c => c[0])
    expect(lines.some(l => l.includes('id') && l.includes('val'))).toBe(true)
    expect(lines.some(l => l.includes('hello'))).toBe(true)
  })

  it('prints "No rows." when query returns nothing', async () => {
    const id = await makeDb()
    await handler({ id, sql: 'SELECT * FROM t WHERE id = 999', projectDir: tmp })
    expect(console.log).toHaveBeenCalledWith('No rows.')
  })

  it('exits 1 on unknown id', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(handler({ id: 'nope', sql: 'SELECT 1', projectDir: tmp })).rejects.toThrow('exit')
    exitSpy.mockRestore()
  })
})
