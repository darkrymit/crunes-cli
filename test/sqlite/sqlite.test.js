import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getSqlitePluginDir, getSqliteProjectDir, getSqliteProjectPluginDir,
  sqliteDbKey, upsertSqliteDb, loadSqliteDbs, listSqliteDbs,
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
})
