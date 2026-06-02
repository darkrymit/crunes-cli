import os from 'node:os'
import path from 'node:path'
import { getCachePluginDir, getCacheProjectDir, getCacheProjectPluginDir } from '../../cache/index.js'
import { getSqlitePluginDir, getSqliteProjectDir, getSqliteProjectPluginDir } from '../../sqlite/index.js'
import { shortHash, getProjectKey } from '../../project/index.js'
export { shortHash, getProjectKey }

const VIRTUAL_STORE_PREFIXES = [
  '@global-plugin-cache',
  '@global-project-plugin-cache',
  '@global-project-cache',
  '@global-plugin-sqlite',
  '@global-project-plugin-sqlite',
  '@global-project-sqlite',
  '@local-project-cache',
  '@local-project-plugin-cache',
  '@local-project-sqlite',
  '@local-project-plugin-sqlite',
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

function virtualStoreBase(prefix, { dir, pluginId, projectName, projectId }) {
  const key = () => {
    if (projectId) return projectId
    if (projectName) return `${projectName}-${shortHash(dir)}`
    return shortHash(dir)
  }
  switch (prefix) {
    case '@global-plugin-cache':
      if (!pluginId) throw new Error('@global-plugin-cache requires a plugin context')
      return getCachePluginDir(pluginId)
    case '@global-project-plugin-cache':
      if (!pluginId) throw new Error('@global-project-plugin-cache requires a plugin context')
      return getCacheProjectPluginDir(key(), pluginId)
    case '@global-project-cache':
      return getCacheProjectDir(key())
    case '@global-plugin-sqlite':
      if (!pluginId) throw new Error('@global-plugin-sqlite requires a plugin context')
      return getSqlitePluginDir(pluginId)
    case '@global-project-plugin-sqlite':
      if (!pluginId) throw new Error('@global-project-plugin-sqlite requires a plugin context')
      return getSqliteProjectPluginDir(key(), pluginId)
    case '@global-project-sqlite':
      return getSqliteProjectDir(key())
    case '@local-project-cache':
      return path.join(dir, '.crunes', 'caches', 'project')
    case '@local-project-plugin-cache':
      if (!pluginId) throw new Error('@local-project-plugin-cache requires a plugin context')
      return path.join(dir, '.crunes', 'caches', 'project-plugins', pluginId)
    case '@local-project-sqlite':
      return path.join(dir, '.crunes', 'sqlite', 'project')
    case '@local-project-plugin-sqlite':
      if (!pluginId) throw new Error('@local-project-plugin-sqlite requires a plugin context')
      return path.join(dir, '.crunes', 'sqlite', 'project-plugins', pluginId)
  }
}

export function resolvePath(location, { dir, pluginDir = null, pluginId = null, storeDir = null, projectName = undefined, projectId = undefined } = {}) {
  if (location.startsWith('@plugin/')) {
    if (!pluginDir) throw new Error('@plugin/ paths are only available in plugin runes')
    return path.join(pluginDir, location.slice('@plugin/'.length))
  }
  if (location.startsWith('@project/')) {
    return path.join(dir, location.slice('@project/'.length))
  }
  const virtual = parseVirtualStore(location)
  if (virtual) {
    const base = virtualStoreBase(virtual.prefix, { dir, pluginId, projectName, projectId })
    return virtual.subpath ? path.join(base, virtual.subpath) : base
  }
  if (location === '~' || location.startsWith('~/') || location.startsWith('~\\')) {
    return path.join(os.homedir(), location.slice(1))
  }
  if (path.isAbsolute(location)) return location
  return path.resolve(dir, location)
}

function normalizeGitBashPath(p) {
  // Git bash on Windows emits /c/Users/... instead of C:/Users/...
  // path.relative can't resolve these correctly on Windows, so rewrite them.
  if (process.platform === 'win32') {
    const m = p.match(/^\/([a-zA-Z])(\/|$)/)
    if (m) return `${m[1].toUpperCase()}:/${p.slice(3)}`
  }
  return p
}

export function canonicalizeLocation(location, { dir } = {}) {
  const p = normalizeGitBashPath(location.replace(/\\/g, '/'))
  if (p.startsWith('@project/')) return './' + p.slice('@project/'.length)
  if (p.startsWith('@')) return p
  if (p === '~' || p.startsWith('~/')) return p
  if (path.isAbsolute(p)) {
    if (dir) {
      const rel = path.relative(dir, p).replace(/\\/g, '/')
      if (!rel.startsWith('..')) return './' + rel
    }
    return p
  }
  const resolved = path.resolve(dir, location)
  const rel = path.relative(dir, resolved).replace(/\\/g, '/')
  return rel.startsWith('..') ? rel : './' + rel
}

export function getAutoPermits({ pluginId = null, pluginDir = null } = {}) {
  const permits = []
  if (!pluginDir) {
    permits.push(
      'fs.read:./.crunes/**',
      'cache.read:@local-project-cache/**',
      'cache.write:@local-project-cache/**',
      'sqlite.read:@local-project-sqlite/**',
      'sqlite.write:@local-project-sqlite/**',
      'fs.read:@local-project-sqlite/**',
      'fs.write:@local-project-sqlite/**',
      'cache.read:@global-project-cache/**',
      'cache.write:@global-project-cache/**',
      'sqlite.read:@global-project-sqlite/**',
      'sqlite.write:@global-project-sqlite/**',
      'fs.read:@global-project-sqlite/**',
      'fs.write:@global-project-sqlite/**',
    )
  }
  if (pluginDir) {
    permits.push('fs.read:@plugin/**', 'fs.write:@plugin/**')
  }
  if (pluginId) {
    permits.push(
      'cache.read:@global-plugin-cache/**',
      'cache.write:@global-plugin-cache/**',
      'cache.read:@global-project-plugin-cache/**',
      'cache.write:@global-project-plugin-cache/**',
      'sqlite.read:@global-plugin-sqlite/**',
      'sqlite.write:@global-plugin-sqlite/**',
      'sqlite.read:@global-project-plugin-sqlite/**',
      'sqlite.write:@global-project-plugin-sqlite/**',
      'fs.read:@global-plugin-sqlite/**',
      'fs.write:@global-plugin-sqlite/**',
      'fs.read:@global-project-plugin-sqlite/**',
      'fs.write:@global-project-plugin-sqlite/**',
    )
  }
  return permits
}
