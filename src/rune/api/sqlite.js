import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { resolvePath, canonicalizeLocation } from './utils.js'
import { upsertSqliteDb } from '../../sqlite/index.js'
import { upsertProject, ensureProjectIdentity } from '../../project/index.js'

const SQLITE_SCOPES = {
  '@global-plugin-sqlite':         'global-plugin',
  '@global-project-sqlite':        'global-project',
  '@global-project-plugin-sqlite': 'global-project-plugin',
  '@local-project-sqlite':         'local-project',
  '@local-project-plugin-sqlite':  'local-project-plugin',
}

const GLOBAL_SCOPES = new Set(['global-plugin', 'global-project', 'global-project-plugin'])

function detectSqliteScope(location) {
  for (const [prefix, scope] of Object.entries(SQLITE_SCOPES)) {
    if (location === prefix || location.startsWith(prefix + '/')) return scope
  }
  return null
}

function resolveFileName(name) {
  return /\.\w+$/.test(name) ? name : `${name}.sqlite`
}

function makeHandle(dbPath, checkRead, checkWrite, connections) {
  mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  connections.push(db)
  return {
    query(sql, params = []) {
      if (checkRead) checkRead()
      return db.prepare(sql).all(params)
    },
    get(sql, params = []) {
      if (checkRead) checkRead()
      return db.prepare(sql).get(params) ?? null
    },
    exec(sql, params = []) {
      if (checkWrite) checkWrite()
      const info = db.prepare(sql).run(params)
      return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) }
    },
    run(sql) {
      if (checkWrite) checkWrite()
      db.exec(sql)
    },
    close() {
      if (db.open) {
        db.close()
        const idx = connections.indexOf(db)
        if (idx !== -1) connections.splice(idx, 1)
      }
    },
  }
}

export function createSqliteUtils(dir, checkPermission, { pluginId = null, storeDir = null, projectName = undefined } = {}) {
  const connections = []

  return {
    async openHandle(location, name = 'default') {
      const scope = detectSqliteScope(location)
      if (scope !== null && (name.includes('/') || name.includes('\\'))) {
        throw new TypeError('sqlite name must not contain path separators — use a flat name like "branch-main" instead of "branch/main"')
      }
      let projectId = null
      if (scope !== null) {
        const { id } = await ensureProjectIdentity(dir)
        projectId = id
      }
      const ctx    = { dir, pluginId, storeDir, projectName, projectId }
      const base   = resolvePath(location, ctx)
      const dbPath = path.join(base, resolveFileName(name))
      const canon  = canonicalizeLocation(location, { dir })
      const tokenValue = `${canon}:${name}`
      const checkRead  = checkPermission ? () => checkPermission('sqlite.read',  tokenValue) : null
      const checkWrite = checkPermission ? () => checkPermission('sqlite.write', tokenValue) : null
      if (scope !== null && GLOBAL_SCOPES.has(scope)) {
        await upsertSqliteDb(dbPath, { scope, projectId, pluginId: pluginId ?? null, location, name })
        if (scope === 'global-project' || scope === 'global-project-plugin') {
          await upsertProject(projectId, dir)
        }
      }
      return makeHandle(dbPath, checkRead, checkWrite, connections)
    },
    dispose() {
      for (const db of connections) {
        try { if (db.open) db.close() } catch {}
      }
      connections.length = 0
    },
  }
}
