import os from 'node:os'
import path from 'node:path'
import { getCachePluginDir } from '../../cache/index.js'
import { getSqlitePluginDir } from '../../sqlite/index.js'
import { shortHash, getProjectKey } from '../../project/index.js'
export { shortHash, getProjectKey }


const VIRTUAL_STORE_PREFIXES = [
  '@global-plugin-cache',
  '@global-plugin-sqlite',
  '@local-cache',
  '@local-plugin-cache',
  '@local-sqlite',
  '@local-plugin-sqlite',
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

function virtualStoreBase(prefix, { dir, pluginId }) {
  switch (prefix) {
    case '@global-plugin-cache':
      if (!pluginId) throw new Error('@global-plugin-cache requires a plugin context')
      return getCachePluginDir(pluginId)
    case '@global-plugin-sqlite':
      if (!pluginId) throw new Error('@global-plugin-sqlite requires a plugin context')
      return getSqlitePluginDir(pluginId)
    case '@local-cache':
      return path.join(dir, '.crunes', 'caches', 'project')
    case '@local-plugin-cache':
      if (!pluginId) throw new Error('@local-plugin-cache requires a plugin context')
      return path.join(dir, '.crunes', 'caches', 'plugins', pluginId)
    case '@local-sqlite':
      return path.join(dir, '.crunes', 'sqlite', 'project')
    case '@local-plugin-sqlite':
      if (!pluginId) throw new Error('@local-plugin-sqlite requires a plugin context')
      return path.join(dir, '.crunes', 'sqlite', 'plugins', pluginId)
  }
}

export function resolvePath(location, { dir, pluginDir = null, pluginId = null, storeDir = null } = {}) {
  if (location.startsWith('@plugin/')) {
    if (!pluginDir) throw new Error('@plugin/ paths are only available in plugin runes')
    return path.join(pluginDir, location.slice('@plugin/'.length))
  }
  if (location.startsWith('@project/')) {
    return path.join(dir, location.slice('@project/'.length))
  }
  const virtual = parseVirtualStore(location)
  if (virtual) {
    const base = virtualStoreBase(virtual.prefix, { dir, pluginId })
    return virtual.subpath ? path.join(base, virtual.subpath) : base
  }
  if (location === '~' || location.startsWith('~/') || location.startsWith('~\\')) {
    return path.join(os.homedir(), location.slice(1))
  }
  if (path.isAbsolute(location)) return location
  return path.resolve(dir, location)
}

export function getAutoPermits({ pluginId = null, pluginDir = null } = {}) {
  const permits = []
  if (!pluginDir) {
    permits.push(
      'fs.read:./.crunes/**',
      'cache.read:@local-cache/**',
      'cache.write:@local-cache/**',
      'sqlite.read:@local-sqlite/**',
      'sqlite.write:@local-sqlite/**',
      'fs.read:@local-sqlite/**',
      'fs.write:@local-sqlite/**',
    )
  }
  if (pluginDir) {
    permits.push('fs.read:@plugin/**', 'fs.write:@plugin/**')
  }
  if (pluginId) {
    permits.push(
      'cache.read:@global-plugin-cache/**',
      'cache.write:@global-plugin-cache/**',
      'sqlite.read:@global-plugin-sqlite/**',
      'sqlite.write:@global-plugin-sqlite/**',
      'fs.read:@global-plugin-sqlite/**',
      'fs.write:@global-plugin-sqlite/**',
    )
  }
  return permits
}
