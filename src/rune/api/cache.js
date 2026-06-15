import fs from 'node:fs/promises'
import path from 'node:path'
import { resolvePath } from './utils.js'

const CACHE_SCOPES = {
  '@global-plugin-cache': 'global-plugin',
  '@local-cache':         'local',
  '@local-plugin-cache':  'local-plugin',
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

    async has(key) {
      if (checkRead) checkRead()
      const file = path.join(cacheDir, `${key}.json`)
      try {
        const entry = JSON.parse(await fs.readFile(file, 'utf8'))
        if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
          await fs.rm(file, { force: true })
          return false
        }
        return true
      } catch (e) {
        if (e.code === 'ENOENT') return false
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

export function createCacheUtils(dir, checkPermission, { pluginId = null, storeDir = null } = {}) {
  return {
    async openHandle(location, name = 'default') {
      if (name.includes('/') || name.includes('\\')) {
        throw new TypeError('cache name must not contain path separators — use a flat name like "branch-main" instead of "branch/main"')
      }
      const ctx      = { dir, pluginId, storeDir }
      const cacheDir = path.join(resolvePath(location, ctx), name)
      const tokenValue = `${location}::${name}`
      const checkRead  = checkPermission ? () => checkPermission('cache.read',  tokenValue) : null
      const checkWrite = checkPermission ? () => checkPermission('cache.write', tokenValue) : null
      return makeHandle(cacheDir, checkRead, checkWrite)
    },
  }
}
