import path from 'node:path'
import micromatch from 'micromatch'
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

function normalizeGitBashPath(p) {
  if (process.platform === 'win32') {
    const m = p.match(/^\/([a-zA-Z])(\/|$)/)
    if (m) return `${m[1].toUpperCase()}:/${p.slice(3)}`
  }
  return p
}

function normalizePermission(perm, dir) {
  if (perm.startsWith('fs.read:') || perm.startsWith('fs.write:') || perm.startsWith('fs.exists:') || perm.startsWith('fs.glob:')) {
    const [cap, ...rest] = perm.split(':')
    const rawVal = rest.join(':')
    const val = normalizeGitBashPath(rawVal.replace(/\\/g, '/'))
    const isAbsolute = val.startsWith('/') || /^[a-zA-Z]:/.test(val)
    if (isAbsolute && dir) {
      const rel = path.relative(dir, val).replace(/\\/g, '/')
      if (!rel.startsWith('..')) return `${cap}:./${rel}`
    }
    if (
      !val.startsWith('./') &&
      !val.startsWith('../') &&
      !val.startsWith('@') &&
      !val.startsWith('~/') &&
      !isAbsolute
    ) {
      return `${cap}:./${val}`
    }
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
 * Must be namespaced under the requested lifecycle (e.g. `use`).
 */
export function computeEffectivePermissions(pluginPerms, projectPerms, lifecycle, dir) {
  const namespacePlugin = pluginPerms?.[lifecycle] || {}
  const namespaceProject = projectPerms?.[lifecycle]
  const norm = p => normalizePermission(p, dir)

  const pluginAllow = (namespacePlugin.allow ?? []).map(norm)
  const pluginDeny  = (namespacePlugin.deny ?? []).map(norm)

  return {
    allow: (namespaceProject?.allow ?? pluginAllow).map(norm),
    deny:  [...pluginDeny, ...(namespaceProject?.deny ?? []).map(norm)],
  }
}

/**
 * Returns a checkPermission(capability, value) function that throws PermissionError
 * if the request is not in effective.allow or is in effective.deny.
 */
export function makePermissionChecker(effective) {
  return function checkPermission(capability, value) {
    if (capability === 'ws.client') {
      const allowed = effective.allow.some(p => matchWsPermission(value, p))
      const denied  = effective.deny.length > 0 && effective.deny.some(p => matchWsPermission(value, p))
      if (!allowed || denied) throw new PermissionError(capability, value)
      return
    }
    if (capability === 'http.server') {
      const colonIdx = value.lastIndexOf(':')
      const host = colonIdx !== -1 ? value.slice(0, colonIdx) : value
      if (isLoopbackHost(host)) return
      const allowed = effective.allow.some(p => matchHttpServerPermission(value, p))
      const denied  = effective.deny.length > 0 && effective.deny.some(p => matchHttpServerPermission(value, p))
      if (!allowed || denied) throw new PermissionError(capability, value)
      return
    }
    if (capability === 'ws.server') {
      const firstColon = value.indexOf(':')
      const host = firstColon !== -1 ? value.slice(0, firstColon) : value
      if (isLoopbackHost(host)) return
      const allowed = effective.allow.some(p => matchWsServerPermission(value, p))
      const denied  = effective.deny.length > 0 && effective.deny.some(p => matchWsServerPermission(value, p))
      if (!allowed || denied) throw new PermissionError(capability, value)
      return
    }
    if (capability === 'http.fetch') {
      const allowed = effective.allow.some(p => matchFetchPermission(value, p))
      const denied  = effective.deny.length > 0 && effective.deny.some(p => matchFetchPermission(value, p))
      if (!allowed || denied) throw new PermissionError(capability, value)
      return
    }
    if (capability === 'env.read') {
      const allowed = effective.allow.some(p => matchEnvPermission(value, p))
      const denied  = effective.deny.length > 0 && effective.deny.some(p => matchEnvPermission(value, p))
      if (!allowed || denied) throw new PermissionError(capability, value)
      return
    }
    if (capability === 'sqlite.read' || capability === 'sqlite.write' ||
        capability === 'cache.read'  || capability === 'cache.write') {
      const allowed = effective.allow.some(p => matchStorePermission(value, p, capability))
      const denied  = effective.deny.length > 0 &&
                      effective.deny.some(p => matchStorePermission(value, p, capability))
      if (!allowed || denied) throw new PermissionError(capability, value)
      return
    }
    if (value == null) {
      const norm = capability.replace(/\\/g, '/')
      const allowed = effective.allow.map(p => p.replace(/\\/g, '/')).includes(norm)
      const denied  = effective.deny.length > 0 && effective.deny.map(p => p.replace(/\\/g, '/')).includes(norm)
      if (!allowed || denied) throw new PermissionError(capability, '')
      return
    }
    const token   = `${capability}:${value}`.replace(/\\/g, '/')
    const normalizedAllow = effective.allow.map(p => p.replace(/\\/g, '/'))
    const normalizedDeny = effective.deny.map(p => p.replace(/\\/g, '/'))
    const matchToken = (tok, patterns) => {
      return patterns.some(pattern => {
        if (pattern.endsWith('/**')) {
          const prefix = pattern.slice(0, -2)
          if (tok.startsWith(prefix)) return true
        }
        if (pattern.endsWith(':**')) {
          const prefix = pattern.slice(0, -2)
          if (tok.startsWith(prefix)) return true
        }
        if (pattern.endsWith(':*')) {
          const prefix = pattern.slice(0, -1)
          if (tok.startsWith(prefix)) return true
        }
        return micromatch.isMatch(tok, pattern, { dot: true })
      })
    }
    const allowed = matchToken(token, normalizedAllow)
    const denied  = effective.deny.length > 0 && matchToken(token, normalizedDeny)
    if (!allowed || denied) throw new PermissionError(capability, value)
  }
}
