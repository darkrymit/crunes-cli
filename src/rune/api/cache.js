import fs from 'node:fs/promises'
import path from 'node:path'
import { resolvePath, canonicalizeLocation, getProjectKey } from './utils.js'
import { upsertCacheBucket } from '../../cache/index.js'
import { upsertProject } from '../../project/index.js'

const CACHE_SCOPES = {
  '@plugin-cache':         'plugin',
  '@project-cache':        'project',
  '@project-plugin-cache': 'project-plugin',
}

function detectCacheScope(location) {
  for (const [prefix, scope] of Object.entries(CACHE_SCOPES)) {
    if (location === prefix || location.startsWith(prefix + '/')) return scope
  }
  return null
}

function assertSerializable(value) {
  try {
    JSON.parse(JSON.stringify(value))
  } catch {
    throw new TypeError('utils.cache: value must be JSON-serializable')
  }
}

async function writeAtomicJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data))
  await fs.rename(tmp, filePath)
}

function makeHandle(cacheDir, checkRead, checkWrite) {
  return {
    async set(key, value, ttl = null) {
      if (checkWrite) checkWrite()
      assertSerializable(value)
      const expiresAt = ttl !== null ? Date.now() + Number(ttl) * 1000 : null
      await writeAtomicJson(path.join(cacheDir, `${key}.json`), { value, expiresAt })
    },

    async get(key) {
      if (checkRead) checkRead()
      const file = path.join(cacheDir, `${key}.json`)
      try {
        const entry = JSON.parse(await fs.readFile(file, 'utf8'))
        if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
          await fs.rm(file, { force: true })
          return null
        }
        return entry.value
      } catch (e) {
        if (e.code === 'ENOENT') return null
        throw e
      }
    },

    async delete(key) {
      if (checkWrite) checkWrite()
      await fs.rm(path.join(cacheDir, `${key}.json`), { force: true })
    },

    async clear() {
      if (checkWrite) checkWrite()
      const files = await fs.readdir(cacheDir).catch(e => {
        if (e.code === 'ENOENT') return []
        throw e
      })
      await Promise.all(
        files.filter(f => f.endsWith('.json')).map(f =>
          fs.rm(path.join(cacheDir, f), { force: true })
        )
      )
    },
  }
}

export function createCacheUtils(dir, checkPermission, { pluginId = null, storeDir = null, projectName = undefined } = {}) {
  return {
    async openHandle(location, name = 'default') {
      const scope = detectCacheScope(location)
      if (scope !== null && (name.includes('/') || name.includes('\\'))) {
        throw new TypeError('cache name must not contain path separators — use a flat name like "branch-main" instead of "branch/main"')
      }
      const ctx      = { dir, pluginId, storeDir, projectName }
      const cacheDir = path.join(resolvePath(location, ctx), name)
      const canon    = canonicalizeLocation(location, { dir })
      const tokenValue = `${canon}:${name}`
      const checkRead  = checkPermission ? () => checkPermission('cache.read',  tokenValue) : null
      const checkWrite = checkPermission ? () => checkPermission('cache.write', tokenValue) : null
      if (scope !== null) {
        const projectKey = (scope === 'project' || scope === 'project-plugin')
          ? getProjectKey(dir, projectName)
          : null
        await upsertCacheBucket(cacheDir, { scope, projectKey, pluginId: pluginId ?? null, location, name })
        if (projectKey !== null) await upsertProject(projectKey, dir)
      }
      return makeHandle(cacheDir, checkRead, checkWrite)
    },
  }
}
