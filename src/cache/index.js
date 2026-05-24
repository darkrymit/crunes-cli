import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises'
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

function scopedBuckets(data, projectKey) {
  if (projectKey === undefined) return data.buckets
  return Object.fromEntries(
    Object.entries(data.buckets).filter(([, e]) =>
      (e.scope === 'project' || e.scope === 'project-plugin') && e.projectKey === projectKey
    )
  )
}

export async function listCacheBuckets(projectKey = undefined) {
  const data = await loadCacheBuckets()
  const entries = Object.entries(data.buckets).map(([key, entry]) => ({ key, ...entry }))
  if (projectKey === undefined) return entries
  return entries.filter(e =>
    (e.scope === 'project' || e.scope === 'project-plugin') && e.projectKey === projectKey
  )
}

export function resolveKey(id, buckets) {
  if (id in buckets) return id
  const matches = Object.keys(buckets).filter(k => k.startsWith(id))
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) throw new Error(`No cache bucket matching "${id}".`)
  throw new Error(`Ambiguous id "${id}" — matches: ${matches.join(', ')}.`)
}

export async function clearCacheBucket(id, projectKey = undefined) {
  const data = await loadCacheBuckets()
  const key = resolveKey(id, scopedBuckets(data, projectKey))
  const { path: bucketPath, name } = data.buckets[key]
  let removed = 0
  try {
    const files = await readdir(bucketPath)
    const now = Date.now()
    const results = await Promise.all(
      files.filter(f => f.endsWith('.json')).map(async f => {
        const fp = path.join(bucketPath, f)
        try {
          const entry = JSON.parse(await readFile(fp, 'utf8'))
          if (entry.expiresAt !== null && now > entry.expiresAt) {
            await rm(fp)
            return true
          }
        } catch { /* skip unreadable */ }
        return false
      })
    )
    removed = results.filter(Boolean).length
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  return { removed, name }
}

export async function deleteCacheKey(id, keyName, projectKey = undefined) {
  const data = await loadCacheBuckets()
  const key = resolveKey(id, scopedBuckets(data, projectKey))
  const { path: bucketPath, name } = data.buckets[key]
  try {
    await rm(path.join(bucketPath, `${keyName}.json`))
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`Key "${keyName}" not found in cache bucket "${name}".`)
    throw e
  }
  return { name }
}

export async function deleteCacheBucket(id, projectKey = undefined) {
  const data = await loadCacheBuckets()
  const key = resolveKey(id, scopedBuckets(data, projectKey))
  const { path: bucketPath, name } = data.buckets[key]
  await rm(bucketPath, { recursive: true, force: true })
  delete data.buckets[key]
  const p = getCacheJsonPath()
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(data, null, 2), 'utf8')
  return { name }
}
