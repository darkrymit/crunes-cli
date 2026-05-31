import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSqliteUtils } from '../../../src/rune/api/sqlite.js'
import { makePermissionChecker, PermissionError } from '../../../src/rune/permissions/permissions.js'

async function makeTmp() {
  return mkdtemp(join(tmpdir(), 'crunes-sqlite-test-'))
}

describe('createSqliteUtils â€” core handle operations', () => {
  let tmp
  beforeEach(async () => {
    tmp = await makeTmp()
    process.env.CRUNES_STORE = tmp
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    await rm(tmp, { recursive: true, force: true })
  })

  it('exec + query roundtrip returns inserted rows', async () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await sqlite.openHandle('@global-plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    h.exec('INSERT INTO t (val) VALUES (?)', ['hello'])
    expect(h.query('SELECT * FROM t')).toEqual([{ id: 1, val: 'hello' }])
    h.close()
  })

  it('get returns first matching row', async () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await sqlite.openHandle('@global-plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    h.exec('INSERT INTO t (val) VALUES (?)', ['world'])
    expect(h.get('SELECT * FROM t WHERE val = ?', ['world'])).toEqual({ id: 1, val: 'world' })
    h.close()
  })

  it('get returns null for no match', async () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await sqlite.openHandle('@global-plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    expect(h.get('SELECT * FROM t WHERE val = ?', ['nope'])).toBeNull()
    h.close()
  })

  it('exec returns { changes, lastInsertRowid }', async () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await sqlite.openHandle('@global-plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    expect(h.exec('INSERT INTO t (val) VALUES (?)', ['x'])).toEqual({ changes: 1, lastInsertRowid: 1 })
    h.close()
  })

  it('WAL journal mode is applied on open', async () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await sqlite.openHandle('@global-plugin-sqlite', 'test')
    expect(h.query('PRAGMA journal_mode')).toEqual([{ journal_mode: 'wal' }])
    h.close()
  })

  it('close makes further operations throw', async () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await sqlite.openHandle('@global-plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    h.close()
    expect(() => h.query('SELECT * FROM t')).toThrow()
  })
})

describe('createSqliteUtils â€” name resolution', () => {
  let tmp
  beforeEach(async () => {
    tmp = await makeTmp()
    process.env.CRUNES_STORE = tmp
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    await rm(tmp, { recursive: true, force: true })
  })

  it('name without extension gets .sqlite appended â€” resolves same file as explicit .sqlite', async () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h1 = await sqlite.openHandle('@global-plugin-sqlite', 'mydb')
    h1.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    h1.exec('INSERT INTO t VALUES (1)')
    h1.close()
    const h2 = await sqlite.openHandle('@global-plugin-sqlite', 'mydb.sqlite')
    expect(h2.query('SELECT * FROM t')).toEqual([{ id: 1 }])
    h2.close()
  })

  it('name with .db extension is used as-is', async () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h1 = await sqlite.openHandle('@global-plugin-sqlite', 'data.db')
    h1.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    h1.close()
    const h2 = await sqlite.openHandle('@global-plugin-sqlite', 'data.db')
    expect(h2.query('SELECT * FROM t')).toEqual([])
    h2.close()
  })

  it('name defaults to "default" when omitted', async () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h1 = await sqlite.openHandle('@global-plugin-sqlite')
    h1.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    h1.exec('INSERT INTO t VALUES (42)')
    h1.close()
    const h2 = await sqlite.openHandle('@global-plugin-sqlite', 'default')
    expect(h2.query('SELECT * FROM t')).toEqual([{ id: 42 }])
    h2.close()
  })
})

describe('createSqliteUtils â€” location / pluginId guards', () => {
  let tmp
  beforeEach(async () => {
    tmp = await makeTmp()
    process.env.CRUNES_STORE = tmp
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    await rm(tmp, { recursive: true, force: true })
  })

  it('@global-plugin-sqlite without pluginId throws', async () => {
    const sqlite = createSqliteUtils(tmp, null)
    await expect(sqlite.openHandle('@global-plugin-sqlite', 'test')).rejects.toThrow('@global-plugin-sqlite requires a plugin context')
  })

  it('@global-project-plugin-sqlite without pluginId throws', async () => {
    const sqlite = createSqliteUtils(tmp, null)
    await expect(sqlite.openHandle('@global-project-plugin-sqlite', 'test')).rejects.toThrow('@global-project-plugin-sqlite requires a plugin context')
  })

  it('@global-project-sqlite works without pluginId', async () => {
    const sqlite = createSqliteUtils(tmp, null)
    const h = await sqlite.openHandle('@global-project-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    expect(h.query('SELECT * FROM t')).toEqual([])
    h.close()
  })

  it('@global-project-sqlite/subdir stores and retrieves rows', async () => {
    const sqlite2 = createSqliteUtils(tmp, null)
    const h1 = await sqlite2.openHandle('@global-project-sqlite/data', 'mydb')
    h1.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    h1.exec('INSERT INTO t VALUES (42)')
    h1.close()
    const h2 = await sqlite2.openHandle('@global-project-sqlite/data', 'mydb')
    expect(h2.query('SELECT * FROM t')).toEqual([{ id: 42 }])
    h2.close()
    sqlite2.dispose()
  })

  it('subpath escape throws RangeError', async () => {
    const sqlite2 = createSqliteUtils(tmp, null)
    await expect(sqlite2.openHandle('@global-project-sqlite/../etc', 'mydb')).rejects.toThrow(RangeError)
    sqlite2.dispose()
  })
})

describe('createSqliteUtils â€” permissions', () => {
  let tmp
  let sqlite
  beforeEach(async () => {
    tmp = await makeTmp()
    process.env.CRUNES_STORE = tmp
    sqlite = null
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    if (sqlite) { sqlite.dispose(); sqlite = null }
    await rm(tmp, { recursive: true, force: true })
  })

  it('@global-plugin-sqlite calls checkPermission with @global-plugin-sqlite:name token', async () => {
    const spy = vi.fn()
    sqlite = createSqliteUtils(tmp, spy, { pluginId: 'plug@1.0.0' })
    const h = await sqlite.openHandle('@global-plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    expect(spy).toHaveBeenCalledWith('sqlite.write', '@global-plugin-sqlite:test')
    h.query('SELECT * FROM t')
    expect(spy).toHaveBeenCalledWith('sqlite.read', '@global-plugin-sqlite:test')
    h.close()
  })

  it('sqlite.write checked on exec for arbitrary paths', async () => {
    const spy = vi.fn()
    sqlite = createSqliteUtils(tmp, spy)
    const h = await sqlite.openHandle('./data', 'mydb')
    try { h.exec('CREATE TABLE t (id INTEGER)') } catch {}
    expect(spy).toHaveBeenCalledWith('sqlite.write', './data:mydb')
  })

  it('sqlite.read checked on query for arbitrary paths', async () => {
    const spy = vi.fn()
    sqlite = createSqliteUtils(tmp, spy)
    const h = await sqlite.openHandle('./data', 'mydb')
    try { h.query('SELECT 1') } catch {}
    expect(spy).toHaveBeenCalledWith('sqlite.read', './data:mydb')
  })

  it('sqlite.read checked on get for arbitrary paths', async () => {
    const spy = vi.fn()
    sqlite = createSqliteUtils(tmp, spy)
    const h = await sqlite.openHandle('./data', 'mydb')
    try { h.get('SELECT 1') } catch {}
    expect(spy).toHaveBeenCalledWith('sqlite.read', './data:mydb')
  })

  it('PermissionError thrown by exec when sqlite.write not granted', async () => {
    const checker = makePermissionChecker({ allow: [], deny: [] })
    sqlite = createSqliteUtils(tmp, checker)
    const h = await sqlite.openHandle('./data', 'mydb')
    expect(() => h.exec('CREATE TABLE t (id INTEGER)')).toThrow(PermissionError)
  })

  it('PermissionError thrown by query when sqlite.read not granted', async () => {
    const checker = makePermissionChecker({ allow: [], deny: [] })
    sqlite = createSqliteUtils(tmp, checker)
    const h = await sqlite.openHandle('./data', 'mydb')
    expect(() => h.query('SELECT 1')).toThrow(PermissionError)
  })

  it('sqlite.read granted allows query but not exec', async () => {
    const checker = makePermissionChecker({ allow: ['sqlite.read:./data:mydb'], deny: [] })
    sqlite = createSqliteUtils(tmp, checker)
    const h = await sqlite.openHandle('./data', 'mydb')
    expect(() => h.query('SELECT 1')).not.toThrow()
    expect(() => h.exec('CREATE TABLE t (id INTEGER)')).toThrow(PermissionError)
  })

  it('name defaults to "default" in permission token when omitted', async () => {
    const spy = vi.fn()
    sqlite = createSqliteUtils(tmp, spy)
    const h = await sqlite.openHandle('./data')
    try { h.query('SELECT 1') } catch {}
    expect(spy).toHaveBeenCalledWith('sqlite.read', './data:default')
  })

  it('@global-project-sqlite calls checkPermission with @global-project-sqlite:name token', async () => {
    const spy = vi.fn()
    sqlite = createSqliteUtils(tmp, spy)
    const h = await sqlite.openHandle('@global-project-sqlite', 'mydb')
    try { h.exec('CREATE TABLE t (id INTEGER)') } catch {}
    expect(spy).toHaveBeenCalledWith('sqlite.write', '@global-project-sqlite:mydb')
  })

  it('@global-project-sqlite/data calls checkPermission with subpath token', async () => {
    const spy = vi.fn()
    sqlite = createSqliteUtils(tmp, spy)
    const h = await sqlite.openHandle('@global-project-sqlite/data', 'mydb')
    try { h.exec('CREATE TABLE t (id INTEGER)') } catch {}
    expect(spy).toHaveBeenCalledWith('sqlite.write', '@global-project-sqlite/data:mydb')
  })

  it('@global-plugin-sqlite permission granted via allow pattern passes check', async () => {
    const checker = makePermissionChecker({
      allow: ['sqlite.read:@global-plugin-sqlite/**', 'sqlite.write:@global-plugin-sqlite/**'],
      deny: [],
    })
    sqlite = createSqliteUtils(tmp, checker, { pluginId: 'plug@1.0.0' })
    const h = await sqlite.openHandle('@global-plugin-sqlite', 'test')
    expect(() => h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')).not.toThrow()
    expect(() => h.query('SELECT * FROM t')).not.toThrow()
    h.close()
  })
})

describe('createSqliteUtils â€” dispose', () => {
  let tmp
  beforeEach(async () => {
    tmp = await makeTmp()
    process.env.CRUNES_STORE = tmp
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    await rm(tmp, { recursive: true, force: true })
  })

  it('dispose closes all open connections', async () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h1 = await sqlite.openHandle('@global-plugin-sqlite', 'a')
    const h2 = await sqlite.openHandle('@global-plugin-sqlite', 'b')
    h1.exec('CREATE TABLE t (id INTEGER)')
    h2.exec('CREATE TABLE t (id INTEGER)')
    sqlite.dispose()
    expect(() => h1.query('SELECT * FROM t')).toThrow()
    expect(() => h2.query('SELECT * FROM t')).toThrow()
  })

  it('dispose is safe to call twice', async () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await sqlite.openHandle('@global-plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER)')
    sqlite.dispose()
    expect(() => sqlite.dispose()).not.toThrow()
  })

  it('close removes connection so dispose does not double-close', async () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await sqlite.openHandle('@global-plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER)')
    h.close()
    expect(() => sqlite.dispose()).not.toThrow()
  })
})

describe('SqliteHandle â€” run', () => {
  let tmp
  beforeEach(async () => {
    tmp = await makeTmp()
    process.env.CRUNES_STORE = tmp
  })
  afterEach(async () => {
    delete process.env.CRUNES_STORE
    await rm(tmp, { recursive: true, force: true })
  })

  it('executes a multi-statement SQL script', async () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await sqlite.openHandle('@global-plugin-sqlite', 'test')
    h.run(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT);
      INSERT INTO users (name) VALUES ('alice');
    `)
    expect(h.query('SELECT name FROM users')).toEqual([{ name: 'alice' }])
    expect(h.query("SELECT name FROM sqlite_master WHERE type='table' AND name='posts'"))
      .toEqual([{ name: 'posts' }])
    h.close()
  })

  it('returns undefined', async () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0' })
    const h = await sqlite.openHandle('@global-plugin-sqlite', 'test')
    const result = h.run('CREATE TABLE t (id INTEGER)')
    expect(result).toBeUndefined()
    h.close()
  })

  it('requires sqlite.write permission', async () => {
    const sqlite = createSqliteUtils(tmp, makePermissionChecker({ allow: [], deny: [] }), { pluginId: 'plug@1.0.0' })
    const h = await sqlite.openHandle('@global-plugin-sqlite', 'test')
    expect(() => h.run('CREATE TABLE t (id INTEGER)')).toThrow(PermissionError)
    h.close()
  })
})

