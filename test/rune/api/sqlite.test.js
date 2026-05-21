import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSqliteUtils } from '../../../src/rune/api/sqlite.js'
import { makePermissionChecker, PermissionError } from '../../../src/rune/permissions/permissions.js'

async function makeTmp() {
  return mkdtemp(join(tmpdir(), 'crunes-sqlite-test-'))
}

describe('createSqliteUtils — core handle operations', () => {
  let tmp
  beforeEach(async () => { tmp = await makeTmp() })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('exec + query roundtrip returns inserted rows', () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0', storeDir: tmp })
    const h = sqlite.openHandle('@plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    h.exec('INSERT INTO t (val) VALUES (?)', ['hello'])
    expect(h.query('SELECT * FROM t')).toEqual([{ id: 1, val: 'hello' }])
    h.close()
  })

  it('get returns first matching row', () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0', storeDir: tmp })
    const h = sqlite.openHandle('@plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    h.exec('INSERT INTO t (val) VALUES (?)', ['world'])
    expect(h.get('SELECT * FROM t WHERE val = ?', ['world'])).toEqual({ id: 1, val: 'world' })
    h.close()
  })

  it('get returns null for no match', () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0', storeDir: tmp })
    const h = sqlite.openHandle('@plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    expect(h.get('SELECT * FROM t WHERE val = ?', ['nope'])).toBeNull()
    h.close()
  })

  it('exec returns { changes, lastInsertRowid }', () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0', storeDir: tmp })
    const h = sqlite.openHandle('@plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    expect(h.exec('INSERT INTO t (val) VALUES (?)', ['x'])).toEqual({ changes: 1, lastInsertRowid: 1 })
    h.close()
  })

  it('WAL journal mode is applied on open', () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0', storeDir: tmp })
    const h = sqlite.openHandle('@plugin-sqlite', 'test')
    expect(h.query('PRAGMA journal_mode')).toEqual([{ journal_mode: 'wal' }])
    h.close()
  })

  it('close makes further operations throw', () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0', storeDir: tmp })
    const h = sqlite.openHandle('@plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    h.close()
    expect(() => h.query('SELECT * FROM t')).toThrow()
  })
})

describe('createSqliteUtils — name resolution', () => {
  let tmp
  beforeEach(async () => { tmp = await makeTmp() })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('name without extension gets .sqlite appended — resolves same file as explicit .sqlite', () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0', storeDir: tmp })
    const h1 = sqlite.openHandle('@plugin-sqlite', 'mydb')
    h1.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    h1.exec('INSERT INTO t VALUES (1)')
    h1.close()
    const h2 = sqlite.openHandle('@plugin-sqlite', 'mydb.sqlite')
    expect(h2.query('SELECT * FROM t')).toEqual([{ id: 1 }])
    h2.close()
  })

  it('name with .db extension is used as-is', () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0', storeDir: tmp })
    const h1 = sqlite.openHandle('@plugin-sqlite', 'data.db')
    h1.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    h1.close()
    const h2 = sqlite.openHandle('@plugin-sqlite', 'data.db')
    expect(h2.query('SELECT * FROM t')).toEqual([])
    h2.close()
  })

  it('name defaults to "default" when omitted', () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0', storeDir: tmp })
    const h1 = sqlite.openHandle('@plugin-sqlite')
    h1.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    h1.exec('INSERT INTO t VALUES (42)')
    h1.close()
    const h2 = sqlite.openHandle('@plugin-sqlite', 'default')
    expect(h2.query('SELECT * FROM t')).toEqual([{ id: 42 }])
    h2.close()
  })
})

describe('createSqliteUtils — location / pluginId guards', () => {
  let tmp
  beforeEach(async () => { tmp = await makeTmp() })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('@plugin-sqlite without pluginId throws', () => {
    const sqlite = createSqliteUtils(tmp, null, { storeDir: tmp })
    expect(() => sqlite.openHandle('@plugin-sqlite', 'test')).toThrow('@plugin-sqlite requires a plugin context')
  })

  it('@project-plugin-sqlite without pluginId throws', () => {
    const sqlite = createSqliteUtils(tmp, null, { storeDir: tmp })
    expect(() => sqlite.openHandle('@project-plugin-sqlite', 'test')).toThrow('@project-plugin-sqlite requires a plugin context')
  })

  it('@project-sqlite works without pluginId', () => {
    const sqlite = createSqliteUtils(tmp, null, { storeDir: tmp })
    const h = sqlite.openHandle('@project-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    expect(h.query('SELECT * FROM t')).toEqual([])
    h.close()
  })

  it('@project-sqlite/subdir stores and retrieves rows', () => {
    const sqlite2 = createSqliteUtils(tmp, null, { storeDir: tmp })
    const h1 = sqlite2.openHandle('@project-sqlite/data', 'mydb')
    h1.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    h1.exec('INSERT INTO t VALUES (42)')
    h1.close()
    const h2 = sqlite2.openHandle('@project-sqlite/data', 'mydb')
    expect(h2.query('SELECT * FROM t')).toEqual([{ id: 42 }])
    h2.close()
    sqlite2.dispose()
  })

  it('subpath escape throws RangeError', () => {
    const sqlite2 = createSqliteUtils(tmp, null, { storeDir: tmp })
    expect(() => sqlite2.openHandle('@project-sqlite/../etc', 'mydb')).toThrow(RangeError)
    sqlite2.dispose()
  })
})

describe('createSqliteUtils — permissions', () => {
  let tmp
  let sqlite
  beforeEach(async () => { tmp = await makeTmp(); sqlite = null })
  afterEach(async () => {
    if (sqlite) { sqlite.dispose(); sqlite = null }
    await rm(tmp, { recursive: true, force: true })
  })

  it('@plugin-sqlite calls checkPermission with @plugin-sqlite:name token', () => {
    const spy = vi.fn()
    sqlite = createSqliteUtils(tmp, spy, { pluginId: 'plug@1.0.0', storeDir: tmp })
    const h = sqlite.openHandle('@plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    expect(spy).toHaveBeenCalledWith('sqlite.write', '@plugin-sqlite:test')
    h.query('SELECT * FROM t')
    expect(spy).toHaveBeenCalledWith('sqlite.read', '@plugin-sqlite:test')
    h.close()
  })

  it('sqlite.write checked on exec for arbitrary paths', () => {
    const spy = vi.fn()
    sqlite = createSqliteUtils(tmp, spy, { storeDir: tmp })
    const h = sqlite.openHandle('./data', 'mydb')
    try { h.exec('CREATE TABLE t (id INTEGER)') } catch {}
    expect(spy).toHaveBeenCalledWith('sqlite.write', './data:mydb')
  })

  it('sqlite.read checked on query for arbitrary paths', () => {
    const spy = vi.fn()
    sqlite = createSqliteUtils(tmp, spy, { storeDir: tmp })
    const h = sqlite.openHandle('./data', 'mydb')
    try { h.query('SELECT 1') } catch {}
    expect(spy).toHaveBeenCalledWith('sqlite.read', './data:mydb')
  })

  it('sqlite.read checked on get for arbitrary paths', () => {
    const spy = vi.fn()
    sqlite = createSqliteUtils(tmp, spy, { storeDir: tmp })
    const h = sqlite.openHandle('./data', 'mydb')
    try { h.get('SELECT 1') } catch {}
    expect(spy).toHaveBeenCalledWith('sqlite.read', './data:mydb')
  })

  it('PermissionError thrown by exec when sqlite.write not granted', () => {
    const checker = makePermissionChecker({ allow: [], deny: [] })
    sqlite = createSqliteUtils(tmp, checker, { storeDir: tmp })
    const h = sqlite.openHandle('./data', 'mydb')
    expect(() => h.exec('CREATE TABLE t (id INTEGER)')).toThrow(PermissionError)
  })

  it('PermissionError thrown by query when sqlite.read not granted', () => {
    const checker = makePermissionChecker({ allow: [], deny: [] })
    sqlite = createSqliteUtils(tmp, checker, { storeDir: tmp })
    const h = sqlite.openHandle('./data', 'mydb')
    expect(() => h.query('SELECT 1')).toThrow(PermissionError)
  })

  it('sqlite.read granted allows query but not exec', () => {
    const checker = makePermissionChecker({ allow: ['sqlite.read:./data:mydb'], deny: [] })
    sqlite = createSqliteUtils(tmp, checker, { storeDir: tmp })
    const h = sqlite.openHandle('./data', 'mydb')
    expect(() => h.query('SELECT 1')).not.toThrow()
    expect(() => h.exec('CREATE TABLE t (id INTEGER)')).toThrow(PermissionError)
  })

  it('name defaults to "default" in permission token when omitted', () => {
    const spy = vi.fn()
    sqlite = createSqliteUtils(tmp, spy, { storeDir: tmp })
    const h = sqlite.openHandle('./data')
    try { h.query('SELECT 1') } catch {}
    expect(spy).toHaveBeenCalledWith('sqlite.read', './data:default')
  })

  it('@project-sqlite calls checkPermission with @project-sqlite:name token', () => {
    const spy = vi.fn()
    sqlite = createSqliteUtils(tmp, spy, { storeDir: tmp })
    const h = sqlite.openHandle('@project-sqlite', 'mydb')
    try { h.exec('CREATE TABLE t (id INTEGER)') } catch {}
    expect(spy).toHaveBeenCalledWith('sqlite.write', '@project-sqlite:mydb')
  })

  it('@project-sqlite/data calls checkPermission with subpath token', () => {
    const spy = vi.fn()
    sqlite = createSqliteUtils(tmp, spy, { storeDir: tmp })
    const h = sqlite.openHandle('@project-sqlite/data', 'mydb')
    try { h.exec('CREATE TABLE t (id INTEGER)') } catch {}
    expect(spy).toHaveBeenCalledWith('sqlite.write', '@project-sqlite/data:mydb')
  })

  it('@plugin-sqlite permission granted via allow pattern passes check', () => {
    const checker = makePermissionChecker({
      allow: ['sqlite.read:@plugin-sqlite/**', 'sqlite.write:@plugin-sqlite/**'],
      deny: [],
    })
    sqlite = createSqliteUtils(tmp, checker, { pluginId: 'plug@1.0.0', storeDir: tmp })
    const h = sqlite.openHandle('@plugin-sqlite', 'test')
    expect(() => h.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')).not.toThrow()
    expect(() => h.query('SELECT * FROM t')).not.toThrow()
    h.close()
  })
})

describe('createSqliteUtils — dispose', () => {
  let tmp
  beforeEach(async () => { tmp = await makeTmp() })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('dispose closes all open connections', () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0', storeDir: tmp })
    const h1 = sqlite.openHandle('@plugin-sqlite', 'a')
    const h2 = sqlite.openHandle('@plugin-sqlite', 'b')
    h1.exec('CREATE TABLE t (id INTEGER)')
    h2.exec('CREATE TABLE t (id INTEGER)')
    sqlite.dispose()
    expect(() => h1.query('SELECT * FROM t')).toThrow()
    expect(() => h2.query('SELECT * FROM t')).toThrow()
  })

  it('dispose is safe to call twice', () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0', storeDir: tmp })
    const h = sqlite.openHandle('@plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER)')
    sqlite.dispose()
    expect(() => sqlite.dispose()).not.toThrow()
  })

  it('close removes connection so dispose does not double-close', () => {
    const sqlite = createSqliteUtils(tmp, null, { pluginId: 'plug@1.0.0', storeDir: tmp })
    const h = sqlite.openHandle('@plugin-sqlite', 'test')
    h.exec('CREATE TABLE t (id INTEGER)')
    h.close()
    expect(() => sqlite.dispose()).not.toThrow()
  })
})
