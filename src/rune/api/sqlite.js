import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { resolvePath, canonicalizeLocation } from './utils.js'
import { getStorePath } from '../../store/index.js'

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
    close() {
      if (db.open) {
        db.close()
        const idx = connections.indexOf(db)
        if (idx !== -1) connections.splice(idx, 1)
      }
    },
  }
}

export function createSqliteUtils(dir, checkPermission, { pluginId = null, storeDir = getStorePath(), projectName = undefined } = {}) {
  const connections = []

  return {
    openHandle(location, name = 'default') {
      const ctx = { dir, pluginId, storeDir, projectName }
      const base    = resolvePath(location, ctx)
      const dbPath  = path.join(base, resolveFileName(name))
      const canon   = canonicalizeLocation(location, { dir })
      const tokenValue = `${canon}:${name}`
      const checkRead  = checkPermission ? () => checkPermission('sqlite.read',  tokenValue) : null
      const checkWrite = checkPermission ? () => checkPermission('sqlite.write', tokenValue) : null
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
