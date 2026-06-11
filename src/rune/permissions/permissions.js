import os from 'node:os'
import { isMatch } from '../../shared/match.js'
import { resolvePath } from '../api/utils.js'
import { matchFetchPermission } from './permissions-http.js'
import { matchEnvPermission } from './permissions-env.js'
import { matchStorePermission } from './permissions-store.js'
import { matchWsPermission, matchWsServerPermission } from './permissions-ws.js'
import { matchHttpServerPermission, isLoopbackHost } from './permissions-http-server.js'

export class PermissionError extends Error {
  constructor(capability, value) {
    super(`'${capability}:${value}' is not permitted.`)
    this.name = 'PermissionError'
    this.capability = capability
    this.value = value
  }
}

const HOME = os.homedir().replace(/\\/g, '/')

// @local-project-* tokens resolve inside dir, so their absolute also gets relative siblings.
const LOCAL_VIRTUAL_PREFIXES = new Set([
  '@local-project-cache', '@local-project-plugin-cache',
  '@local-project-sqlite', '@local-project-plugin-sqlite',
])

const ALL_VIRTUAL_PREFIXES = [
  '@global-plugin-cache', '@global-project-plugin-cache', '@global-project-cache',
  '@global-plugin-sqlite', '@global-project-plugin-sqlite', '@global-project-sqlite',
  '@local-project-cache', '@local-project-plugin-cache',
  '@local-project-sqlite', '@local-project-plugin-sqlite',
  '@plugin',
]

/**
 * Expand a full "cap:value" permission string into all equivalent sibling forms.
 * Handles fs.*, cache.*, and sqlite.* caps. All others return [perm].
 *
 * ctx = { dir, pluginId?, pluginDir?, projectId? }
 */
function expandPattern(perm, ctx) {
  const colonIdx = perm.indexOf(':')
  if (colonIdx === -1) return [perm]
  const cap = perm.slice(0, colonIdx)
  const isFs    = cap === 'fs.read' || cap === 'fs.write' || cap === 'fs.exists' || cap === 'fs.glob'
  const isStore = cap === 'cache.read' || cap === 'cache.write' || cap === 'sqlite.read' || cap === 'sqlite.write'
  if (!isFs && !isStore) return [perm]
  if (!ctx?.dir) return [perm]
  const { dir, pluginId = null, pluginDir = null, projectId = null } = ctx
  const absDir = dir.replace(/\\/g, '/')

  if (isStore) {
    const rest = perm.slice(colonIdx + 1)
    const dColonIdx = rest.indexOf('::')
    const loc  = dColonIdx === -1 ? rest : rest.slice(0, dColonIdx)
    const name = dColonIdx === -1 ? '' : '::' + rest.slice(dColonIdx + 2)
    return expandLocValue(loc, absDir, { pluginId, pluginDir, projectId })
      .map(expandedLoc => `${cap}:${expandedLoc}${name}`)
  }

  const value = perm.slice(colonIdx + 1)
  return expandLocValue(value, absDir, { pluginId, pluginDir, projectId })
    .map(v => `${cap}:${v}`)
}

function expandLocValue(value, absDir, { pluginId, pluginDir, projectId }) {
  const v = value.replace(/\\/g, '/')
  if (v.startsWith('~/')) return [v, HOME + v.slice(1)]
  if (v.startsWith('../')) return [v]
  const isAbsolute = v.startsWith('/') || /^[a-zA-Z]:/.test(v)
  if (isAbsolute) {
    if (v.startsWith(absDir + '/')) {
      const rel = v.slice(absDir.length + 1)
      return [v, `./${rel}`, rel, `@project/${rel}`]
    }
    return [v]
  }
  if (v.startsWith('@project/')) {
    const rel = v.slice('@project/'.length)
    return [v, `./${rel}`, rel, absDir + '/' + rel]
  }
  const matchedPrefix = ALL_VIRTUAL_PREFIXES.find(p => v === p || v.startsWith(p + '/'))
  if (matchedPrefix) {
    const suffix = v.slice(matchedPrefix.length)
    try {
      const base = resolvePath(matchedPrefix, { dir: absDir, pluginId, pluginDir, projectId }).replace(/\\/g, '/')
      const absResolved = base + suffix
      if (LOCAL_VIRTUAL_PREFIXES.has(matchedPrefix)) {
        const rel = absResolved.slice(absDir.length + 1)
        return [v, absResolved, `./${rel}`, rel, `@project/${rel}`]
      }
      return [v, absResolved]
    } catch { return [v] }
  }
  const rel = v.startsWith('./') ? v.slice(2) : v
  return [`./${rel}`, rel, absDir + '/' + rel, `@project/${rel}`]
}

function normalizeGitBashPath(p) {
  if (process.platform === 'win32') {
    const m = p.match(/^\/([a-zA-Z])(\/|$)/)
    if (m) return `${m[1].toUpperCase()}:/${p.slice(3)}`
  }
  return p
}

function normalizePattern(perm) {
  if (perm.startsWith('fs.read:') || perm.startsWith('fs.write:') || perm.startsWith('fs.exists:') || perm.startsWith('fs.glob:')) {
    const [cap, ...rest] = perm.split(':')
    const raw = normalizeGitBashPath(rest.join(':').replace(/\\/g, '/'))
    // @project/foo is an alias for ./foo (purely syntactic)
    const val = raw.startsWith('@project/') ? './' + raw.slice('@project/'.length) : raw
    const isAbsolute = val.startsWith('/') || /^[a-zA-Z]:/.test(val)
    // Bare names (no prefix) get ./ so the checker can strip it for micromatch.
    const v = (!val.startsWith('./') && !val.startsWith('../') && !val.startsWith('@') && !val.startsWith('~/') && !isAbsolute)
      ? `./${val}`
      : val
    return `${cap}:${v}`
  }
  if (perm.startsWith('cache.read:') || perm.startsWith('cache.write:') ||
      perm.startsWith('sqlite.read:') || perm.startsWith('sqlite.write:')) {
    const colonIdx = perm.indexOf(':')
    const cap      = perm.slice(0, colonIdx)
    const rest     = perm.slice(colonIdx + 1)
    if (rest.startsWith('@')) return perm

    const dColonIdx = rest.indexOf('::')
    const rawLoc  = dColonIdx === -1 ? rest : rest.slice(0, dColonIdx)
    const rawName = dColonIdx !== -1 ? rest.slice(dColonIdx + 2) : null
    let loc = rawLoc
    if (
      !loc.startsWith('./') &&
      !loc.startsWith('../') &&
      !loc.startsWith('~/') &&
      !loc.startsWith('/') &&
      !/^[a-zA-Z]:/.test(loc)
    ) {
      loc = './' + loc
    }
    if (rawName === null) return `${cap}:${loc}`
    return `${cap}:${loc}::${rawName}`
  }
  return perm
}

/**
 * Compute effective allow/deny from plugin.json permissions + optional project override.
 * Must be namespaced under the requested lifecycle (e.g. `run`).
 */
export function computeEffectivePermissions(pluginPerms, projectPerms, lifecycle) {
  const namespacePlugin = pluginPerms?.[lifecycle] || {}
  const namespaceProject = projectPerms?.[lifecycle]

  const pluginAllow = (namespacePlugin.allow ?? []).map(normalizePattern)
  const pluginDeny  = (namespacePlugin.deny ?? []).map(normalizePattern)

  return {
    allow: namespaceProject?.allow ? namespaceProject.allow.map(normalizePattern) : pluginAllow,
    deny:  [...pluginDeny, ...(namespaceProject?.deny ?? []).map(normalizePattern)],
  }
}

/**
 * Returns a checkPermission(capability, value) function that throws PermissionError
 * if the request is not in effective.allow or is in effective.deny.
 *
 * ctx = { dir, pluginId?, pluginDir?, projectId? } — used to expand fs/cache/sqlite pattern
 * siblings at build time so runtime path values match regardless of their form.
 */
export function makePermissionChecker(effective, ctx = null) {
  const buckets = new Map()
  const getBucket = cap => {
    if (!buckets.has(cap)) buckets.set(cap, { allow: [], deny: [] })
    return buckets.get(cap)
  }
  const capOf = p => { const i = p.indexOf(':'); return i === -1 ? p : p.slice(0, i) }
  for (const p of effective.allow) {
    for (const expanded of expandPattern(p, ctx)) getBucket(capOf(expanded)).allow.push(expanded)
  }
  for (const p of effective.deny) {
    for (const expanded of expandPattern(p, ctx)) getBucket(capOf(expanded)).deny.push(expanded)
  }

  const checkAndThrow = (capability, value, matchFn) => {
    const b = buckets.get(capability) ?? { allow: [], deny: [] }
    const n = capability.length + 1
    const pv = p => p.length > n ? p.slice(n) : null
    const allowed = b.allow.some(p => { const v = pv(p); return v !== null && matchFn(v) })
    const denied  = b.deny.length > 0 && b.deny.some(p => { const v = pv(p); return v !== null && matchFn(v) })
    if (!allowed || denied) throw new PermissionError(capability, value)
  }

  return function checkPermission(capability, value) {
    switch (capability) {
      case 'fs.read':
      case 'fs.write':
      case 'fs.exists':
      case 'fs.glob': {
        const normalize = s => s.replace(/\\/g, '/').replace(/^@project\//, '').replace(/^\.\//, '')
        const v = normalize(value)
        checkAndThrow(capability, value, pv => isMatch(v, normalize(pv)))
        return
      }
      case 'shell.run':
      case 'shell.job.start':
      case 'rune.run':
      case 'rune.job.start':
      case 'rune.spawn':
      case 'rune.kill':
      case 'rune.exists':
      case 'db.connect': {
        const v = value.replace(/\\/g, '/')
        checkAndThrow(capability, value, pv => isMatch(v, pv))
        return
      }
      // Capabilities whose value is always null — permission declared as bare capability name.
      case 'rune.job.kill':
      case 'rune.job.exists':
      case 'rune.job.read':
      case 'shell.job.kill':
      case 'shell.job.exists':
      case 'shell.job.read': {
        const b = buckets.get(capability)
        if (!b?.allow.length || b.deny.length > 0) throw new PermissionError(capability, '')
        return
      }
      case 'http.fetch':
        checkAndThrow(capability, value, pv => matchFetchPermission(value, pv))
        return
      case 'env.read':
        checkAndThrow(capability, value, pv => matchEnvPermission(value, pv))
        return
      case 'sqlite.read':
      case 'sqlite.write':
      case 'cache.read':
      case 'cache.write':
        checkAndThrow(capability, value, pv => matchStorePermission(value, pv))
        return
      case 'ws.client':
        checkAndThrow(capability, value, pv => matchWsPermission(value, pv))
        return
      case 'http.server': {
        const colonIdx = value.lastIndexOf(':')
        const host = colonIdx !== -1 ? value.slice(0, colonIdx) : value
        if (isLoopbackHost(host)) return
        checkAndThrow(capability, value, pv => matchHttpServerPermission(value, pv))
        return
      }
      case 'ws.server': {
        const firstColon = value.indexOf(':')
        const host = firstColon !== -1 ? value.slice(0, firstColon) : value
        if (isLoopbackHost(host)) return
        checkAndThrow(capability, value, pv => matchWsServerPermission(value, pv))
        return
      }
      default:
        throw new PermissionError(capability, value ?? '')
    }
  }
}
