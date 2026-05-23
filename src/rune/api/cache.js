import fs from 'node:fs/promises'
import path from 'node:path'
import { resolvePath, canonicalizeLocation } from './utils.js'
import { getStorePath } from '../../store/index.js'

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

export function createCacheUtils(dir, checkPermission, { pluginId = null, storeDir = getStorePath(), projectName = undefined } = {}) {
  return {
    openHandle(location, name = 'default') {
      const ctx = { dir, pluginId, storeDir, projectName }
      const cacheDir = path.join(resolvePath(location, ctx), name)
      const canon = canonicalizeLocation(location, { dir })
      const tokenValue = `${canon}:${name}`
      const checkRead  = checkPermission ? () => checkPermission('cache.read',  tokenValue) : null
      const checkWrite = checkPermission ? () => checkPermission('cache.write', tokenValue) : null
      return makeHandle(cacheDir, checkRead, checkWrite)
    },
  }
}
