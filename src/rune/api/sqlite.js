import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { resolvePath } from './utils.js'
import { PermissionError } from '../permissions/permissions.js'

async function loadDatabase() {
  try {
    const { default: Database } = await import('better-sqlite3')
    return Database
  } catch {
    throw new Error(
      'better-sqlite3 is not installed.\n' +
      'Run: npm install -g better-sqlite3'
    )
  }
}

const SQLITE_SCOPES = {
  '@global-plugin-sqlite': 'global-plugin',
  '@local-sqlite':         'local',
  '@local-plugin-sqlite':  'local-plugin',
}

function detectSqliteScope(location) {
  for (const [prefix, scope] of Object.entries(SQLITE_SCOPES)) {
    if (location === prefix || location.startsWith(prefix + '/')) return scope
  }
  return null
}

function resolveFileName(name) {
  return /\.\w+$/.test(name) ? name : `${name}.sqlite`
}

function isGranted(check) {
  if (!check) return true
  try {
    check()
    return true
  } catch (err) {
    if (err instanceof PermissionError) return false
    throw err
  }
}

// Opening is already a disk operation: it creates the file and sets its journal mode. Without a
// write grant the file is opened read-only, which leaves a database another program owns alone.
function openDatabase(Database, dbPath, checkRead, checkWrite) {
  if (isGranted(checkWrite)) {
    mkdirSync(path.dirname(dbPath), { recursive: true })
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    return db
  }
  checkRead()
  if (!existsSync(dbPath)) throw new Error(`sqlite.open: no database at ${dbPath}, and creating one needs a sqlite.write grant`)
  return new Database(dbPath, { readonly: true, fileMustExist: true })
}

function makeHandle(Database, dbPath, checkRead, checkWrite, connections) {
  const db = openDatabase(Database, dbPath, checkRead, checkWrite)
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

export function createSqliteUtils(dir, checkPermission, { pluginId = null, storeDir = null } = {}) {
  const connections = []

  return {
    async openHandle(location, name = 'default') {
      const Database = await loadDatabase()
      if (name.includes('/') || name.includes('\\')) {
        throw new TypeError('sqlite name must not contain path separators — use a flat name like "branch-main" instead of "branch/main"')
      }
      const ctx    = { dir, pluginId, storeDir }
      const base   = resolvePath(location, ctx)
      const dbPath = path.join(base, resolveFileName(name))
      const tokenValue = `${location}::${name}`
      const checkRead  = checkPermission ? () => checkPermission('sqlite.read',  tokenValue) : null
      const checkWrite = checkPermission ? () => checkPermission('sqlite.write', tokenValue) : null
      return makeHandle(Database, dbPath, checkRead, checkWrite, connections)
    },
    dispose() {
      for (const db of connections) {
        try { if (db.open) db.close() } catch {}
      }
      connections.length = 0
    },
  }
}
