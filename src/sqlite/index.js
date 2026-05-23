import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { getSqliteBasePath, getSqliteJsonPath } from '../store/index.js'

export function getSqlitePluginDir(pluginId) {
  return path.join(getSqliteBasePath(), 'plugins', pluginId)
}

export function getSqliteProjectDir(key) {
  return path.join(getSqliteBasePath(), 'projects', key)
}

export function getSqliteProjectPluginDir(key, pluginId) {
  return path.join(getSqliteBasePath(), 'project-plugins', key, pluginId)
}

export function sqliteDbKey(name, resolvedPath) {
  const hash = createHash('sha256').update(resolvedPath).digest('hex').slice(0, 12)
  return `${name}-${hash}`
}

export async function loadSqliteDbs() {
  try {
    return JSON.parse(await readFile(getSqliteJsonPath(), 'utf8'))
  } catch {
    return { format: '1', databases: {} }
  }
}

export async function upsertSqliteDb(resolvedPath, { scope, projectKey, pluginId, location, name }) {
  const data = await loadSqliteDbs()
  const key  = sqliteDbKey(name, resolvedPath)
  data.databases[key] = {
    path: resolvedPath,
    scope,
    projectKey: projectKey ?? null,
    pluginId:   pluginId   ?? null,
    location,
    name,
    firstSeenAt: data.databases[key]?.firstSeenAt ?? new Date().toISOString(),
  }
  const p = getSqliteJsonPath()
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(data, null, 2), 'utf8')
}

export async function listSqliteDbs() {
  const data = await loadSqliteDbs()
  return Object.entries(data.databases).map(([key, entry]) => ({ key, ...entry }))
}
