import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { getStorePath } from '../../plugin/store.js'

export function shortHash(str) {
  return createHash('sha1').update(str).digest('hex').slice(0, 8)
}

export function getProjectKey(dir, name = undefined) {
  const hash = shortHash(dir)
  if (typeof name === 'string' && name.length > 0) return `${name}-${hash}`
  try {
    const config = JSON.parse(readFileSync(path.join(dir, '.crunes', 'config.json'), 'utf8'))
    const n = config.name
    if (typeof n === 'string' && n.length > 0) return `${n}-${hash}`
  } catch {}
  return hash
}

const VIRTUAL_STORE_PREFIXES = [
  '@plugin-cache',
  '@project-plugin-cache',
  '@project-cache',
  '@plugin-sqlite',
  '@project-plugin-sqlite',
  '@project-sqlite',
]

function parseVirtualStore(location) {
  for (const prefix of VIRTUAL_STORE_PREFIXES) {
    if (location === prefix) return { prefix, subpath: '' }
    if (location.startsWith(prefix + '/')) {
      const raw = location.slice(prefix.length + 1)
      const normalized = path.normalize(raw).replace(/\\/g, '/')
      if (normalized.startsWith('..')) throw new RangeError(`subpath escapes virtual root: ${location}`)
      return { prefix, subpath: normalized }
    }
  }
  return null
}

function virtualStoreBase(prefix, { dir, pluginId, storeDir, projectName }) {
  const store = storeDir ?? getStorePath()
  const key = () => getProjectKey(dir, projectName)
  switch (prefix) {
    case '@plugin-cache':
      if (!pluginId) throw new Error('@plugin-cache requires a plugin context')
      return path.join(store, 'cache', 'plugins', pluginId)
    case '@project-plugin-cache':
      if (!pluginId) throw new Error('@project-plugin-cache requires a plugin context')
      return path.join(store, 'cache', 'projects', key(), 'plugins', pluginId)
    case '@project-cache':
      return path.join(store, 'cache', 'projects', key())
    case '@plugin-sqlite':
      if (!pluginId) throw new Error('@plugin-sqlite requires a plugin context')
      return path.join(store, 'sqlite', 'plugins', pluginId)
    case '@project-plugin-sqlite':
      if (!pluginId) throw new Error('@project-plugin-sqlite requires a plugin context')
      return path.join(store, 'sqlite', 'projects', key(), 'plugins', pluginId)
    case '@project-sqlite':
      return path.join(store, 'sqlite', 'projects', key())
  }
}

export function resolvePath(location, { dir, pluginDir = null, pluginId = null, storeDir = null, projectName = undefined } = {}) {
  if (location.startsWith('@plugin/')) {
    if (!pluginDir) throw new Error('@plugin/ paths are only available in plugin runes')
    return path.join(pluginDir, location.slice('@plugin/'.length))
  }
  if (location.startsWith('@project/')) {
    return path.join(dir, location.slice('@project/'.length))
  }
  const virtual = parseVirtualStore(location)
  if (virtual) {
    const base = virtualStoreBase(virtual.prefix, { dir, pluginId, storeDir, projectName })
    return virtual.subpath ? path.join(base, virtual.subpath) : base
  }
  if (location === '~' || location.startsWith('~/') || location.startsWith('~\\')) {
    return path.join(os.homedir(), location.slice(1))
  }
  if (path.isAbsolute(location)) return location
  return path.resolve(dir, location)
}

export function canonicalizeLocation(location, { dir } = {}) {
  const p = location.replace(/\\/g, '/')
  if (p.startsWith('@project/')) return './' + p.slice('@project/'.length)
  if (p.startsWith('@')) return p
  if (p === '~' || p.startsWith('~/')) return p
  if (path.isAbsolute(location)) return p
  const resolved = path.resolve(dir, location)
  const rel = path.relative(dir, resolved).replace(/\\/g, '/')
  return rel.startsWith('..') ? rel : './' + rel
}

export function getAutoPermits({ pluginId = null, pluginDir = null } = {}) {
  const permits = []
  if (!pluginDir) {
    permits.push('fs.read:.crunes/**')
  }
  if (pluginDir) {
    permits.push('fs.read:@plugin/**', 'fs.write:@plugin/**')
  }
  if (pluginId) {
    permits.push(
      'cache.read:@plugin-cache/**',
      'cache.write:@plugin-cache/**',
      'cache.read:@project-plugin-cache/**',
      'cache.write:@project-plugin-cache/**',
      'sqlite.read:@plugin-sqlite/**',
      'sqlite.write:@plugin-sqlite/**',
      'sqlite.read:@project-plugin-sqlite/**',
      'sqlite.write:@project-plugin-sqlite/**',
      'fs.read:@plugin-sqlite/**',
      'fs.write:@plugin-sqlite/**',
      'fs.read:@project-plugin-sqlite/**',
      'fs.write:@project-plugin-sqlite/**',
    )
  }
  return permits
}
