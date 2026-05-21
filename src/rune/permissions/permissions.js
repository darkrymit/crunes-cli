import micromatch from 'micromatch'
import { matchFetchPermission } from './permissions-http.js'
import { matchEnvPermission } from './permissions-env.js'
import { matchStorePermission } from './permissions-store.js'

export class PermissionError extends Error {
  constructor(capability, value) {
    super(`'${capability}:${value}' is not permitted.`)
    this.name = 'PermissionError'
    this.capability = capability
    this.value = value
  }
}

function normalizePermission(perm) {
  if (perm.startsWith('fs.read:') || perm.startsWith('fs.write:') || perm.startsWith('fs.exists:') || perm.startsWith('fs.glob:')) {
    const [cap, ...rest] = perm.split(':')
    const val = rest.join(':')
    if (
      !val.startsWith('./') &&
      !val.startsWith('../') &&
      !val.startsWith('@') &&
      !val.startsWith('~/') &&
      !val.startsWith('/') &&
      !/^[a-zA-Z]:/.test(val) // Windows absolute path
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
    const sepIdx  = rest.lastIndexOf(':')
    const rawLoc  = sepIdx === -1 ? rest : rest.slice(0, sepIdx)
    const rawName = sepIdx !== -1 ? rest.slice(sepIdx + 1) : null
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
    return `${cap}:${loc}:${rawName}`
  }
  return perm
}

/**
 * Compute effective allow/deny from plugin.json permissions + optional project override.
 * Must be namespaced under the requested lifecycle (e.g. `use`).
 */
export function computeEffectivePermissions(pluginPerms, projectPerms, lifecycle) {
  const namespacePlugin = pluginPerms?.[lifecycle] || {}
  const namespaceProject = projectPerms?.[lifecycle]

  const pluginAllow = (namespacePlugin.allow ?? []).map(normalizePermission)
  const pluginDeny  = (namespacePlugin.deny ?? []).map(normalizePermission)
  
  return {
    allow: (namespaceProject?.allow ?? pluginAllow).map(normalizePermission),
    deny:  [...pluginDeny, ...(namespaceProject?.deny ?? []).map(normalizePermission)],
  }
}

/**
 * Returns a checkPermission(capability, value) function that throws PermissionError
 * if the request is not in effective.allow or is in effective.deny.
 */
export function makePermissionChecker(effective) {
  return function checkPermission(capability, value) {
    if (capability === 'fetch') {
      const allowed = effective.allow.some(p => matchFetchPermission(value, p))
      const denied  = effective.deny.length > 0 && effective.deny.some(p => matchFetchPermission(value, p))
      if (!allowed || denied) throw new PermissionError(capability, value)
      return
    }
    if (capability === 'env') {
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
    const token   = `${capability}:${value}`
    const allowed = micromatch.isMatch(token, effective.allow, { dot: true })
    const denied  = effective.deny.length > 0 && micromatch.isMatch(token, effective.deny, { dot: true })
    if (!allowed || denied) throw new PermissionError(capability, value)
  }
}
