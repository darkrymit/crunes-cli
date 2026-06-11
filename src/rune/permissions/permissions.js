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

// Virtual token prefixes that resolvePath can expand to real absolute paths.
// @plugin is handled separately by resolvePath (not in VIRTUAL_STORE_PREFIXES).
const VIRTUAL_PREFIXES = [
  '@global-plugin-cache', '@global-project-plugin-cache', '@global-project-cache',
  '@global-plugin-sqlite', '@global-project-plugin-sqlite', '@global-project-sqlite',
  '@local-project-cache', '@local-project-plugin-cache',
  '@local-project-sqlite', '@local-project-plugin-sqlite',
  '@plugin',
]

/**
 * Expand a single fs pattern value (no cap: prefix) into one or two strings.
 * Emits a sibling so that relative ↔ absolute ↔ virtual forms all match at check time.
 *
 * ctx = { dir, pluginId?, pluginDir?, projectId? }
 */
function expandPattern(patternValue, ctx) {
  if (!ctx?.dir) return [patternValue]
  const { dir, pluginId = null, pluginDir = null, projectId = null } = ctx
  const absDir = dir.replace(/\\/g, '/')

  if (patternValue.startsWith('./')) {
    return [patternValue, absDir + '/' + patternValue.slice(2)]
  }

  const isAbsolute = patternValue.startsWith('/') || /^[a-zA-Z]:/.test(patternValue)
  if (isAbsolute) {
    const absVal = patternValue.replace(/\\/g, '/')
    if (absVal.startsWith(absDir + '/')) return [patternValue, './' + absVal.slice(absDir.length + 1)]
    return [patternValue]
  }

  // Virtual token: split prefix from glob suffix, resolve prefix only.
  const matchedPrefix = VIRTUAL_PREFIXES.find(p => patternValue === p || patternValue.startsWith(p + '/'))
  if (matchedPrefix) {
    const suffix = patternValue.slice(matchedPrefix.length) // '' or '/sub/**'
    try {
      const base = resolvePath(matchedPrefix, { dir, pluginId, pluginDir, projectId }).replace(/\\/g, '/')
      return [patternValue, base + suffix]
    } catch { return [patternValue] }
  }

  return [patternValue]
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

const FS_CAPS = new Set(['fs.read', 'fs.write', 'fs.exists', 'fs.glob'])

/**
 * Returns a checkPermission(capability, value) function that throws PermissionError
 * if the request is not in effective.allow or is in effective.deny.
 *
 * ctx = { dir, pluginId?, pluginDir?, projectId? } — used to expand fs pattern siblings
 * at build time so relative ↔ absolute ↔ virtual forms all match.
 */
export function makePermissionChecker(effective, ctx = null) {
  const buckets = new Map()
  const getBucket = cap => {
    if (!buckets.has(cap)) buckets.set(cap, { allow: [], deny: [] })
    return buckets.get(cap)
  }
  const capOf = p => { const i = p.indexOf(':'); return i === -1 ? p : p.slice(0, i) }
  for (const p of effective.allow) {
    const cap = capOf(p)
    const b = getBucket(cap)
    if (FS_CAPS.has(cap) && ctx) {
      const pv = p.slice(cap.length + 1)
      for (const expanded of expandPattern(pv, ctx)) b.allow.push(`${cap}:${expanded}`)
    } else {
      b.allow.push(p)
    }
  }
  for (const p of effective.deny) {
    const cap = capOf(p)
    const b = getBucket(cap)
    if (FS_CAPS.has(cap) && ctx) {
      const pv = p.slice(cap.length + 1)
      for (const expanded of expandPattern(pv, ctx)) b.deny.push(`${cap}:${expanded}`)
    } else {
      b.deny.push(p)
    }
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
        const strip = s => s.replace(/^~\//, `${HOME}/`).replace(/^\.\//, '')
        const v = strip(value.replace(/\\/g, '/'))
        checkAndThrow(capability, value, pv => isMatch(v, strip(pv)))
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
