import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getSqlitePluginDir, getSqliteProjectDir, getSqliteProjectPluginDir,
  sqliteDbKey, upsertSqliteDb, loadSqliteDbs, listSqliteDbs,
  resolveKey, deleteSqliteDb, querySqliteDb,
} from '../../src/sqlite/index.js'

const PLUGIN_ID = 'my-plugin@1.0.0'
const PROJ_KEY  = 'abc123def456'

describe('sqlite path helpers', () => {
  let tmp
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-sqlite-')); process.env.CRUNES_STORE = tmp })
  afterEach(async () => { delete process.env.CRUNES_STORE; await rm(tmp, { recursive: true, force: true }) })

  it('getSqlitePluginDir', () => {
    expect(getSqlitePluginDir(PLUGIN_ID)).toBe(join(tmp, 'sqlite', 'plugins', PLUGIN_ID))
  })
  it('getSqliteProjectDir', () => {
    expect(getSqliteProjectDir(PROJ_KEY)).toBe(join(tmp, 'sqlite', 'projects', PROJ_KEY))
  })
  it('getSqliteProjectPluginDir', () => {
    expect(getSqliteProjectPluginDir(PROJ_KEY, PLUGIN_ID)).toBe(
      join(tmp, 'sqlite', 'project-plugins', PROJ_KEY, PLUGIN_ID)
    )
  })
})

describe('sqlite index', () => {
  let tmp
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-sqlite-')); process.env.CRUNES_STORE = tmp })
  afterEach(async () => { delete process.env.CRUNES_STORE; await rm(tmp, { recursive: true, force: true }) })

  it('loadSqliteDbs returns empty structure when file missing', async () => {
    expect(await loadSqliteDbs()).toEqual({ format: '1', databases: {} })
  })

  it('sqliteDbKey produces stable <name>-<12hexchars> format', () => {
    const key = sqliteDbKey('default', '/some/path/default.sqlite')
    expect(key).toMatch(/^default-[0-9a-f]{12}$/)
    expect(sqliteDbKey('default', '/some/path')).toBe(sqliteDbKey('default', '/some/path'))
  })

  it('upsertSqliteDb creates sqlite.json with correct entry', async () => {
    const dbPath = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'default.sqlite')
    await upsertSqliteDb(dbPath, {
      scope: 'project', projectKey: PROJ_KEY, pluginId: null,
      location: '@project-sqlite', name: 'default',
    })
    const data = await loadSqliteDbs()
    const entries = Object.values(data.databases)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      path: dbPath, scope: 'project', projectKey: PROJ_KEY,
      pluginId: null, location: '@project-sqlite', name: 'default',
    })
    expect(typeof entries[0].firstSeenAt).toBe('string')
  })

  it('upsertSqliteDb preserves firstSeenAt on re-upsert', async () => {
    const dbPath = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'default.sqlite')
    const meta = { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'default' }
    await upsertSqliteDb(dbPath, meta)
    const first = await loadSqliteDbs()
    const key = Object.keys(first.databases)[0]
    const firstSeenAt = first.databases[key].firstSeenAt
    await upsertSqliteDb(dbPath, meta)
    expect((await loadSqliteDbs()).databases[key].firstSeenAt).toBe(firstSeenAt)
  })

  it('upsertSqliteDb accumulates multiple databases', async () => {
    await upsertSqliteDb(join(tmp, 'sqlite', 'projects', PROJ_KEY, 'a.sqlite'), {
      scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'a',
    })
    await upsertSqliteDb(join(tmp, 'sqlite', 'projects', PROJ_KEY, 'b.sqlite'), {
      scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'b',
    })
    expect(Object.keys((await loadSqliteDbs()).databases)).toHaveLength(2)
  })

  it('listSqliteDbs returns array with key field', async () => {
    const dbPath = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'default.sqlite')
    await upsertSqliteDb(dbPath, {
      scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'default',
    })
    const list = await listSqliteDbs()
    expect(list).toHaveLength(1)
    expect(list[0].key).toMatch(/^default-[0-9a-f]{12}$/)
    expect(list[0].path).toBe(dbPath)
  })

  it('listSqliteDbs(projectKey) returns only matching entries', async () => {
    const p1 = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'a.sqlite')
    const p2 = join(tmp, 'sqlite', 'projects', 'other-key', 'b.sqlite')
    const p3 = join(tmp, 'sqlite', 'plugins', 'my-plugin', 'c.sqlite')
    await upsertSqliteDb(p1, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'a' })
    await upsertSqliteDb(p2, { scope: 'project', projectKey: 'other-key', pluginId: null, location: '@project-sqlite', name: 'b' })
    await upsertSqliteDb(p3, { scope: 'plugin', projectKey: null, pluginId: 'my-plugin', location: '@plugin-sqlite', name: 'c' })
    const list = await listSqliteDbs(PROJ_KEY)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('a')
  })

  it('listSqliteDbs() with no arg returns all entries', async () => {
    const p1 = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'a.sqlite')
    const p2 = join(tmp, 'sqlite', 'projects', 'other-key', 'b.sqlite')
    await upsertSqliteDb(p1, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'a' })
    await upsertSqliteDb(p2, { scope: 'project', projectKey: 'other-key', pluginId: null, location: '@project-sqlite', name: 'b' })
    expect(await listSqliteDbs()).toHaveLength(2)
  })
})

describe('sqlite index — management operations', () => {
  let tmp
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-sqlite-')); process.env.CRUNES_STORE = tmp })
  afterEach(async () => { delete process.env.CRUNES_STORE; await rm(tmp, { recursive: true, force: true }) })

  // resolveKey
  it('resolveKey returns exact key when it exists', async () => {
    const dbPath = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'default.sqlite')
    await upsertSqliteDb(dbPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'default' })
    const data = await loadSqliteDbs()
    const key = Object.keys(data.databases)[0]
    expect(resolveKey(key, data.databases)).toBe(key)
  })

  it('resolveKey matches by prefix', async () => {
    const dbPath = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'default.sqlite')
    await upsertSqliteDb(dbPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'default' })
    const data = await loadSqliteDbs()
    const key = Object.keys(data.databases)[0]
    expect(resolveKey(key.slice(0, 10), data.databases)).toBe(key)
  })

  it('resolveKey throws on no match', () => {
    expect(() => resolveKey('nope', {})).toThrow('No SQLite database matching "nope".')
  })

  it('resolveKey throws on ambiguous prefix', async () => {
    const p1 = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'a.sqlite')
    const p2 = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'b.sqlite')
    await upsertSqliteDb(p1, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'a' })
    await upsertSqliteDb(p2, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'b' })
    const data = await loadSqliteDbs()
    expect(() => resolveKey('', data.databases)).toThrow('Ambiguous')
  })

  // deleteSqliteDb
  it('deleteSqliteDb removes the .sqlite file and deregisters from sqlite.json', async () => {
    const { mkdir: mk, access, writeFile: wf } = await import('node:fs/promises')
    const dbPath = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'default.sqlite')
    await mk(join(tmp, 'sqlite', 'projects', PROJ_KEY), { recursive: true })
    await wf(dbPath, '')
    await upsertSqliteDb(dbPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'default' })
    const data = await loadSqliteDbs()
    const key = Object.keys(data.databases)[0]
    const result = await deleteSqliteDb(key)
    expect(result.name).toBe('default')
    await expect(access(dbPath)).rejects.toThrow()
    expect(Object.keys((await loadSqliteDbs()).databases)).toHaveLength(0)
  })

  it('deleteSqliteDb ignores missing WAL/SHM sidecars', async () => {
    const { mkdir: mk, writeFile: wf } = await import('node:fs/promises')
    const dbPath = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'default.sqlite')
    await mk(join(tmp, 'sqlite', 'projects', PROJ_KEY), { recursive: true })
    await wf(dbPath, '')
    await upsertSqliteDb(dbPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'default' })
    const data = await loadSqliteDbs()
    const key = Object.keys(data.databases)[0]
    await expect(deleteSqliteDb(key)).resolves.not.toThrow()
  })

  // querySqliteDb
  it('querySqliteDb returns rows from a SQLite database', async () => {
    const Database = (await import('better-sqlite3')).default
    const { mkdir: mk } = await import('node:fs/promises')
    const dbPath = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'notes.sqlite')
    await mk(join(tmp, 'sqlite', 'projects', PROJ_KEY), { recursive: true })
    const db = new Database(dbPath)
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)")
    db.exec("INSERT INTO t VALUES (1, 'hello')")
    db.close()
    await upsertSqliteDb(dbPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'notes' })
    const data = await loadSqliteDbs()
    const key = Object.keys(data.databases)[0]
    const rows = await querySqliteDb(key, 'SELECT * FROM t')
    expect(rows).toEqual([{ id: 1, val: 'hello' }])
  })

  it('querySqliteDb returns empty array when no rows match', async () => {
    const Database = (await import('better-sqlite3')).default
    const { mkdir: mk } = await import('node:fs/promises')
    const dbPath = join(tmp, 'sqlite', 'projects', PROJ_KEY, 'empty.sqlite')
    await mk(join(tmp, 'sqlite', 'projects', PROJ_KEY), { recursive: true })
    const db = new Database(dbPath)
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)")
    db.close()
    await upsertSqliteDb(dbPath, { scope: 'project', projectKey: PROJ_KEY, pluginId: null, location: '@project-sqlite', name: 'empty' })
    const data = await loadSqliteDbs()
    const key = Object.keys(data.databases)[0]
    expect(await querySqliteDb(key, 'SELECT * FROM t')).toEqual([])
  })

  it('deleteSqliteDb rejects an id from a different project', async () => {
    const { mkdir: mk, writeFile: wf } = await import('node:fs/promises')
    const dbPath = join(tmp, 'sqlite', 'projects', 'other-key', 'x.sqlite')
    await mk(join(tmp, 'sqlite', 'projects', 'other-key'), { recursive: true })
    await wf(dbPath, '')
    await upsertSqliteDb(dbPath, { scope: 'project', projectKey: 'other-key', pluginId: null, location: '@project-sqlite', name: 'x' })
    const data = await loadSqliteDbs()
    const id = Object.keys(data.databases)[0]
    await expect(deleteSqliteDb(id, PROJ_KEY)).rejects.toThrow(/No SQLite database matching/)
  })

  it('querySqliteDb rejects an id from a different project', async () => {
    const { mkdir: mk, writeFile: wf } = await import('node:fs/promises')
    const dbPath = join(tmp, 'sqlite', 'projects', 'other-key', 'y.sqlite')
    await mk(join(tmp, 'sqlite', 'projects', 'other-key'), { recursive: true })
    await wf(dbPath, '')
    await upsertSqliteDb(dbPath, { scope: 'project', projectKey: 'other-key', pluginId: null, location: '@project-sqlite', name: 'y' })
    const data = await loadSqliteDbs()
    const id = Object.keys(data.databases)[0]
    await expect(querySqliteDb(id, 'SELECT 1', PROJ_KEY)).rejects.toThrow(/No SQLite database matching/)
  })
})
