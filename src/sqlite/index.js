import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import path from 'node:path'
import Database from 'better-sqlite3'
import { getSqliteBasePath, getSqliteJsonPath } from '../store/index.js'
import { storageKey } from '../store/storage-key.js'

export function getSqlitePluginDir(pluginId) {
  return path.join(getSqliteBasePath(), 'plugins', pluginId)
}

export function getSqliteProjectDir(key) {
  return path.join(getSqliteBasePath(), 'projects', key)
}

export function getSqliteProjectPluginDir(key, pluginId) {
  return path.join(getSqliteBasePath(), 'project-plugins', key, pluginId)
}

export async function loadSqliteDbs() {
  try {
    return JSON.parse(await readFile(getSqliteJsonPath(), 'utf8'))
  } catch {
    return { format: '1', databases: {} }
  }
}

export async function upsertSqliteDb(resolvedPath, { scope, projectId, pluginId, location, name }) {
  const data = await loadSqliteDbs()
  const effectiveProjectId = projectId ?? null
  const key = storageKey(scope, { projectId: effectiveProjectId, pluginId, name })
  data.databases[key] = {
    path: resolvedPath,
    scope,
    projectKey: effectiveProjectId,
    pluginId:   pluginId ?? null,
    location,
    name,
    firstSeenAt: data.databases[key]?.firstSeenAt ?? new Date().toISOString(),
  }
  const p = getSqliteJsonPath()
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(data, null, 2), 'utf8')
}

function scopedDatabases(data, projectKey) {
  if (projectKey === undefined) return data.databases
  return Object.fromEntries(
    Object.entries(data.databases).filter(([, e]) =>
      (e.scope === 'global-project' || e.scope === 'global-project-plugin') && e.projectKey === projectKey
    )
  )
}

export async function listSqliteDbs(projectKey = undefined) {
  const data = await loadSqliteDbs()
  return Object.entries(scopedDatabases(data, projectKey)).map(([key, entry]) => ({ key, ...entry }))
}

export async function listLocalSqliteDbs(projectDir) {
  let projectId
  try {
    const raw = await readFile(path.join(projectDir, '.crunes', 'project.local.json'), 'utf8')
    projectId = JSON.parse(raw).id
  } catch {
    return []
  }
  const results = []
  const localSqliteDir = path.join(projectDir, '.crunes', 'sqlite')

  async function scanScope(scopeDir, scope, pluginId = null) {
    let entries
    try { entries = await readdir(scopeDir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.sqlite')) continue
      const name = entry.name.slice(0, -'.sqlite'.length)
      const key = storageKey(scope, { projectId, pluginId, name })
      const location = pluginId
        ? `@local-project-plugin-sqlite/${pluginId}/${name}`
        : `@local-project-sqlite/${name}`
      results.push({ key, scope, projectKey: projectId, pluginId, location, name, firstSeenAt: null, path: path.join(scopeDir, entry.name) })
    }
  }

  await scanScope(path.join(localSqliteDir, 'project'), 'local-project')

  const pluginsDir = path.join(localSqliteDir, 'project-plugins')
  let pluginEntries
  try { pluginEntries = await readdir(pluginsDir, { withFileTypes: true }) } catch { pluginEntries = [] }
  for (const pluginEntry of pluginEntries) {
    if (!pluginEntry.isDirectory()) continue
    await scanScope(path.join(pluginsDir, pluginEntry.name), 'local-project-plugin', pluginEntry.name)
  }

  return results
}

export function resolveKey(id, databases) {
  if (id in databases) return id
  const matches = Object.keys(databases).filter(k => k.startsWith(id))
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) throw new Error(`No SQLite database matching "${id}".`)
  throw new Error(`Ambiguous id "${id}" — matches: ${matches.join(', ')}.`)
}

export async function deleteSqliteDb(id, projectKey = undefined) {
  const data = await loadSqliteDbs()
  const key = resolveKey(id, scopedDatabases(data, projectKey))
  const { path: dbPath, name } = data.databases[key]
  await rm(dbPath, { force: true })
  await rm(dbPath + '-wal', { force: true })
  await rm(dbPath + '-shm', { force: true })
  delete data.databases[key]
  const p = getSqliteJsonPath()
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(data, null, 2), 'utf8')
  return { name }
}

export async function querySqliteDb(id, sql, projectKey = undefined) {
  const data = await loadSqliteDbs()
  const key = resolveKey(id, scopedDatabases(data, projectKey))
  const { path: dbPath } = data.databases[key]
  const db = new Database(dbPath, { readonly: true })
  try {
    return db.prepare(sql).all()
  } finally {
    db.close()
  }
}
