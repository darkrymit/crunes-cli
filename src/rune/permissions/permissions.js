import os from 'node:os'
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

const HOME = os.homedir().replace(/\\/g, '/')
const MM_OPTS = { dot: true, noextglob: true, nonegate: true, nobrace: true, nobracket: true }

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
  const norm = p => normalizePattern(p)

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
  const check = (capability, value, matchFn) => {
    const allowed = effective.allow.some(p => matchFn(p))
    const denied  = effective.deny.length > 0 && effective.deny.some(p => matchFn(p))
    if (!allowed || denied) throw new PermissionError(capability, value)
  }

  return function checkPermission(capability, value) {
    switch (capability) {
      case 'fs.read':
      case 'fs.write':
      case 'fs.exists':
      case 'fs.glob': {
        const v = value.replace(/\\/g, '/').replace(/^~\//, `${HOME}/`)
        const token = `${capability}:${v}`
        check(capability, value, p => {
          const [pc, pv = ''] = p.split(/:(.*)/)
          return micromatch.isMatch(token, `${pc}:${pv.replace(/^~\//, `${HOME}/`)}`, MM_OPTS)
        })
        return
      }
      // Capabilities whose values may contain special chars (e.g. Windows short paths with ~1)
      // :** / :* use startsWith because micromatch can't match Windows drive letters (C:/) in tokens.
      case 'shell.run':
      case 'shell.job.start':
      case 'rune.run':
      case 'rune.job.start':
      case 'rune.spawn':
      case 'rune.kill':
      case 'rune.exists':
      case 'db.connect': {
        const token = `${capability}:${value}`.replace(/\\/g, '/')
        check(capability, value, p => {
          if (p.endsWith(':**') && token.startsWith(p.slice(0, -2))) return true
          if (p.endsWith(':*')  && token.startsWith(p.slice(0, -1))) return true
          return micromatch.isMatch(token, p, MM_OPTS)
        })
        return
      }
      // Capabilities whose value is always null — permission declared as bare capability name.
      case 'rune.job.kill':
      case 'rune.job.exists':
      case 'rune.job.read':
      case 'shell.job.kill':
      case 'shell.job.exists':
      case 'shell.job.read':
        if (!effective.allow.includes(capability) || effective.deny.includes(capability)) {
          throw new PermissionError(capability, '')
        }
        return
      case 'http.fetch':
        check(capability, value, p => matchFetchPermission(value, p))
        return
      case 'env.read':
        check(capability, value, p => matchEnvPermission(value, p))
        return
      case 'sqlite.read':
      case 'sqlite.write':
      case 'cache.read':
      case 'cache.write':
        check(capability, value, p => matchStorePermission(value, p, capability))
        return
      case 'ws.client':
        check(capability, value, p => matchWsPermission(value, p))
        return
      case 'http.server': {
        const colonIdx = value.lastIndexOf(':')
        const host = colonIdx !== -1 ? value.slice(0, colonIdx) : value
        if (isLoopbackHost(host)) return
        check(capability, value, p => matchHttpServerPermission(value, p))
        return
      }
      case 'ws.server': {
        const firstColon = value.indexOf(':')
        const host = firstColon !== -1 ? value.slice(0, firstColon) : value
        if (isLoopbackHost(host)) return
        check(capability, value, p => matchWsServerPermission(value, p))
        return
      }
      default:
        throw new PermissionError(capability, value ?? '')
    }
  }
}
