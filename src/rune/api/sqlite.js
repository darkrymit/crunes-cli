import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import { getStorePath } from '../../plugin/store.js'

function shortHash(str) {
  return createHash('sha1').update(str).digest('hex').slice(0, 8)
}

function getProjectKey(dir) {
  const hash = shortHash(dir)
  try {
    const config = JSON.parse(readFileSync(path.join(dir, '.crunes', 'config.json'), 'utf8'))
    const name = config.name
    if (typeof name === 'string' && name.length > 0) return `${name}-${hash}`
  } catch {}
  return hash
}

function canonicalizePath(dir, inputPath) {
  const p = inputPath.replace(/\\/g, '/')
  if (path.isAbsolute(inputPath)) return p
  const resolved = path.resolve(dir, inputPath)
  const rel = path.relative(dir, resolved).replace(/\\/g, '/')
  return rel.startsWith('..') ? rel : './' + rel
}

function resolveFileName(name) {
  return /\.\w+$/.test(name) ? name : `${name}.sqlite`
}

function resolveDbPath(dir, pluginId, storeDir, location, name) {
  const filename = resolveFileName(name)
  if (location === '@plugin-sqlite') {
    if (!pluginId) throw new Error('utils.sqlite: @plugin-sqlite requires a plugin context')
    return path.join(storeDir, 'sqlite', 'plugins', pluginId, filename)
  }
  if (location === '@project-plugin-sqlite') {
    if (!pluginId) throw new Error('utils.sqlite: @project-plugin-sqlite requires a plugin context')
    return path.join(storeDir, 'sqlite', 'projects', getProjectKey(dir), 'plugins', pluginId, filename)
  }
  if (location === '@project-sqlite') {
    return path.join(storeDir, 'sqlite', 'projects', getProjectKey(dir), filename)
  }
  const base = path.isAbsolute(location) ? location : path.resolve(dir, location)
  return path.join(base, filename)
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

export function createSqliteUtils(dir, checkPermission, pluginId = null, storeDir = getStorePath()) {
  const connections = []

  return {
    openHandle(location, name = 'default') {
      const autoPermitted = location === '@plugin-sqlite' ||
                            location === '@project-plugin-sqlite' ||
                            location === '@project-sqlite'
      const dbPath = resolveDbPath(dir, pluginId, storeDir, location, name)
      if (autoPermitted) return makeHandle(dbPath, null, null, connections)

      const canonical = canonicalizePath(dir, location)
      const permValue = `${canonical}:${name}`
      const checkRead  = checkPermission ? () => checkPermission('sqlite.read',  permValue) : null
      const checkWrite = checkPermission ? () => checkPermission('sqlite.write', permValue) : null
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
