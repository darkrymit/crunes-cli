import os from 'node:os'
import { isMatch } from '../../shared/match.js'
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
    const val = normalizeGitBashPath(rest.join(':').replace(/\\/g, '/'))
    const isAbsolute = val.startsWith('/') || /^[a-zA-Z]:/.test(val)
    if (!val.startsWith('./') && !val.startsWith('../') && !val.startsWith('@') && !val.startsWith('~/') && !isAbsolute) {
      return `${cap}:./${val}`
    }
    return `${cap}:${val}`
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
  const norm = normalizePattern

  const pluginAllow = (namespacePlugin.allow ?? []).map(norm)
  const pluginDeny  = (namespacePlugin.deny ?? []).map(norm)

  return {
    allow: namespaceProject?.allow ? namespaceProject.allow.map(norm) : pluginAllow,
    deny:  [...pluginDeny, ...(namespaceProject?.deny ?? []).map(norm)],
  }
}

/**
 * Returns a checkPermission(capability, value) function that throws PermissionError
 * if the request is not in effective.allow or is in effective.deny.
 */
export function makePermissionChecker(effective) {
  const buckets = new Map()
  const getBucket = cap => {
    if (!buckets.has(cap)) buckets.set(cap, { allow: [], deny: [] })
    return buckets.get(cap)
  }
  const capOf = p => { const i = p.indexOf(':'); return i === -1 ? p : p.slice(0, i) }
  for (const p of effective.allow) getBucket(capOf(p)).allow.push(p)
  for (const p of effective.deny)  getBucket(capOf(p)).deny.push(p)

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
