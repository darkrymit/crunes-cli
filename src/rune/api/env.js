import { readFileSync } from 'node:fs'
import { parse } from 'dotenv'
import { isMatch } from '../../shared/match.js'
import { parseEnvPattern } from '../permissions/permissions-env.js'

function loadFile(dir, src, cache) {
  if (cache.has(src)) return cache.get(src)
  let data = {}
  try { data = parse(readFileSync(`${dir}/${src}`, 'utf8')) } catch {}
  cache.set(src, data)
  return data
}

export function createEnvUtils(dir, checkPermission, permissions) {
  const fileCache = new Map()

  function resolve(key) {
    for (const pattern of permissions.allow) {
      if (!pattern.startsWith('env.read:')) continue
      const { sources, keyPatterns } = parseEnvPattern(pattern)
      const keyOk = keyPatterns.some(pat => isMatch(key, pat))
      if (!keyOk) continue
      
      for (const source of sources) {
        if (source === '*') {
          if (Object.hasOwn(process.env, key)) {
            try {
              if (checkPermission) checkPermission('env.read', `process::${key}`)
              return process.env[key]
            } catch {}
          }
          try {
            if (checkPermission) checkPermission('env.read', `.env.local::${key}`)
            const data = loadFile(dir, '.env.local', fileCache)
            if (Object.hasOwn(data, key)) return data[key]
          } catch {}
          try {
            if (checkPermission) checkPermission('env.read', `.env::${key}`)
            const data = loadFile(dir, '.env', fileCache)
            if (Object.hasOwn(data, key)) return data[key]
          } catch {}
        } else {
          try {
            if (checkPermission) checkPermission('env.read', `${source}::${key}`)
          } catch {
            continue
          }
          const data = source === 'process' ? process.env : loadFile(dir, source, fileCache)
          if (Object.hasOwn(data, key)) return data[key]
        }
      }
    }
    return undefined
  }

  return {
    read: (key, fallback = undefined) => resolve(key) ?? fallback,
    has: (key) => resolve(key) !== undefined,
  }
}
