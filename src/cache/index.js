import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { getCachesBasePath, getCacheJsonPath } from '../store/index.js'

export function getCachePluginDir(pluginId) {
  return path.join(getCachesBasePath(), 'plugins', pluginId)
}

export function getCacheProjectDir(key) {
  return path.join(getCachesBasePath(), 'projects', key)
}

export function getCacheProjectPluginDir(key, pluginId) {
  return path.join(getCachesBasePath(), 'project-plugins', key, pluginId)
}

export function cacheBucketKey(name, resolvedPath) {
  const hash = createHash('sha256').update(resolvedPath).digest('hex').slice(0, 12)
  return `${name}-${hash}`
}

export async function loadCacheBuckets() {
  try {
    return JSON.parse(await readFile(getCacheJsonPath(), 'utf8'))
  } catch {
    return { format: '1', buckets: {} }
  }
}

export async function upsertCacheBucket(resolvedPath, { scope, projectKey, pluginId, location, name }) {
  const data = await loadCacheBuckets()
  const key  = cacheBucketKey(name, resolvedPath)
  data.buckets[key] = {
    path: resolvedPath,
    scope,
    projectKey: projectKey ?? null,
    pluginId:   pluginId   ?? null,
    location,
    name,
    firstSeenAt: data.buckets[key]?.firstSeenAt ?? new Date().toISOString(),
  }
  const p = getCacheJsonPath()
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(data, null, 2), 'utf8')
}

export async function listCacheBuckets() {
  const data = await loadCacheBuckets()
  return Object.entries(data.buckets).map(([key, entry]) => ({ key, ...entry }))
}
