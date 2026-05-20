import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
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

export function createCacheUtils(dir, checkPermission, pluginId = null, storeDir = getStorePath()) {
  function resolveCacheDir(location, name) {
    if (location === '@plugin-cache') {
      if (!pluginId) throw new Error('utils.cache: @plugin-cache requires a plugin context')
      return path.join(storeDir, 'cache', 'plugins', pluginId, name)
    }
    if (location === '@project-plugin-cache') {
      if (!pluginId) throw new Error('utils.cache: @project-plugin-cache requires a plugin context')
      return path.join(storeDir, 'cache', 'projects', getProjectKey(dir), 'plugins', pluginId, name)
    }
    if (location === '@project-cache') {
      return path.join(storeDir, 'cache', 'projects', getProjectKey(dir), name)
    }
    return path.join(path.isAbsolute(location) ? location : path.resolve(dir, location), name)
  }

  return {
    openHandle(location, name = 'default') {
      const cacheDir = resolveCacheDir(location, name)
      const autoPermitted = location === '@plugin-cache' ||
                            location === '@project-plugin-cache' ||
                            location === '@project-cache'
      if (autoPermitted) return makeHandle(cacheDir, null, null)

      const canonical = canonicalizePath(dir, location)
      const checkRead  = checkPermission
        ? () => checkPermission('cache.read',  `${canonical}:${name}`)
        : null
      const checkWrite = checkPermission
        ? () => checkPermission('cache.write', `${canonical}:${name}`)
        : null
      return makeHandle(cacheDir, checkRead, checkWrite)
    },
  }
}
