import os from 'node:os'
import { isGlobMatch, isWildcardMatch } from '../../shared/match.js'
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

// @local-* tokens resolve inside dir, so their absolute also gets relative siblings.
const LOCAL_VIRTUAL_PREFIXES = new Set([
  '@local-cache', '@local-plugin-cache',
  '@local-sqlite', '@local-plugin-sqlite',
])

const ALL_VIRTUAL_PREFIXES = [
  '@global-plugin-cache',
  '@global-plugin-sqlite',
  '@local-cache', '@local-plugin-cache',
  '@local-sqlite', '@local-plugin-sqlite',
  '@plugin',
]

/**
 * Expand a full "cap:value" permission string into all equivalent sibling forms.
 * Handles fs.*, cache.*, and sqlite.* caps. All others return [perm].
 *
 * ctx = { dir, pluginId?, pluginDir? }
 */
function expandPattern(perm, ctx) {
  const colonIdx = perm.indexOf(':')
  if (colonIdx === -1) return [perm]
  const cap = perm.slice(0, colonIdx)
  const isFs    = cap === 'fs.read' || cap === 'fs.write' || cap === 'fs.exists'
  const isStore = cap === 'cache.read' || cap === 'cache.write' || cap === 'sqlite.read' || cap === 'sqlite.write'
  if (!isFs && !isStore) return [perm]
  if (!ctx?.dir) return [perm]
  const { dir, pluginId = null, pluginDir = null } = ctx
  const absDir = dir.replace(/\\/g, '/')

  if (isStore) {
    const rest = perm.slice(colonIdx + 1)
    const dColonIdx = rest.indexOf('::')
    const loc  = dColonIdx === -1 ? rest : rest.slice(0, dColonIdx)
    const name = dColonIdx === -1 ? '' : '::' + rest.slice(dColonIdx + 2)
    return expandLocValue(loc, absDir, { pluginId, pluginDir }, dir)
      .map(expandedLoc => `${cap}:${expandedLoc}${name}`)
  }

  const value = perm.slice(colonIdx + 1)
  return expandLocValue(value, absDir, { pluginId, pluginDir }, dir)
    .map(v => `${cap}:${v}`)
}

function normalizeGitBashPath(p) {
  if (process.platform === 'win32') {
    const m = p.match(/^\/([a-zA-Z])(\/|$)/)
    if (m) return `${m[1].toUpperCase()}:/${p.slice(3)}`
  }
  return p
}

function expandLocValue(value, absDir, { pluginId, pluginDir }, dir) {
  const v = value.replace(/\\/g, '/')
  if (v === '**' || v.startsWith('**/')) return [v]
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
      const base = resolvePath(matchedPrefix, { dir, pluginId, pluginDir }).replace(/\\/g, '/')
      const absResolved = base + suffix
      if (LOCAL_VIRTUAL_PREFIXES.has(matchedPrefix)) {
        const rel = absResolved.slice(absDir.length + 1)
        return [v, absResolved, `./${rel}`, rel, `@project/${rel}`]
      }
      return [v, absResolved]
    } catch { return [v] }
  }
  const hasDot = v.startsWith('./')
  const rel    = hasDot ? v.slice(2) : v
  const relIsGlob = rel === '**' || rel.startsWith('**/')
  return hasDot
    ? (relIsGlob
      ? [`./${rel}`, absDir + '/' + rel, `@project/${rel}`]
      : [`./${rel}`, rel, absDir + '/' + rel, `@project/${rel}`])
    : [`./${rel}`, rel, absDir + '/' + rel, `@project/${rel}`]
}

// Parse a normalized fs.glob permission value (after "fs.glob:") into { cwd, pattern }.
// After normalizePattern all fs.glob perms are in "cwd::pattern" form.
function parseGlobPerm(value) {
  const dColonIdx = value.indexOf('::')
  return { cwd: value.slice(0, dColonIdx), pattern: value.slice(dColonIdx + 2) }
}

// Check a runtime fs.glob(pattern, absCwd) against the list of declared glob permission values.
// Declared cwd is resolved to absolute and glob-matched against the runtime cwd.
// Pattern is exact-matched (or '*' in declared pattern matches any runtime pattern).
function matchGlobPermission(runtimePattern, runtimeAbsCwd, declaredValues, ctx) {
  const normCwd = runtimeAbsCwd.replace(/\\/g, '/')
  return declaredValues.some(val => {
    const { cwd: declCwd, pattern: declPattern } = parseGlobPerm(val)
    if (declPattern !== '*' && declPattern !== runtimePattern) return false
    try {
      const resolvedDeclCwd = resolvePath(declCwd, { dir: ctx.dir, pluginId: ctx.pluginId, pluginDir: ctx.pluginDir })
        .replace(/\\/g, '/')
      const sub = s => s.startsWith('./') ? '__DOT__/' + s.slice(2) : s
      return isGlobMatch(sub(normCwd), [sub(resolvedDeclCwd)])
    } catch { return false }
  })
}

function normalizeFsPath(raw) {
  const val = normalizeGitBashPath(raw.replace(/\\/g, '/'))
  const v   = val.startsWith('@project/') ? './' + val.slice('@project/'.length) : val
  const isAbsolute = v.startsWith('/') || /^[a-zA-Z]:/.test(v)
  return (!v.startsWith('./') && !v.startsWith('../') && !v.startsWith('@') && !v.startsWith('~/') && !isAbsolute)
    ? `./${v}`
    : v
}

function normalizePattern(perm) {
  if (perm.startsWith('fs.glob:')) {
    const rest = perm.slice('fs.glob:'.length)
    const dColonIdx = rest.indexOf('::')
    if (dColonIdx === -1) {
      // Convenience form: no cwd, whole value is pattern. cwd defaults to project root.
      return `fs.glob:.::${rest}`
    }
    const rawCwd     = rest.slice(0, dColonIdx)
    const pattern    = rest.slice(dColonIdx + 2)
    return `fs.glob:${normalizeFsPath(rawCwd)}::${pattern}`
  }
  if (perm.startsWith('fs.read:') || perm.startsWith('fs.write:') || perm.startsWith('fs.exists:')) {
    const [cap, ...rest] = perm.split(':')
    return `${cap}:${normalizeFsPath(rest.join(':'))}`
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
    if (!loc.startsWith('./') && !loc.startsWith('../') && !loc.startsWith('~/') &&
        !loc.startsWith('/') && !/^[a-zA-Z]:/.test(loc)) {
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
  const pluginDeny  = (namespacePlugin.deny  ?? []).map(normalizePattern)

  return {
    allow: namespaceProject?.allow ? namespaceProject.allow.map(normalizePattern) : pluginAllow,
    deny:  [...pluginDeny, ...(namespaceProject?.deny ?? []).map(normalizePattern)],
  }
}

/**
 * Returns a checkPermission(capability, value) function that throws PermissionError
 * if the request is not in effective.allow or is in effective.deny.
 *
 * ctx = { dir, pluginId?, pluginDir? } — used to expand fs/cache/sqlite pattern
 * siblings at build time so runtime path values match regardless of their form.
 */
export function makePermissionChecker(effective, ctx = null) {
  const buckets = new Map()
  const getBucket = cap => {
    if (!buckets.has(cap)) buckets.set(cap, { allow: [], deny: [] })
    return buckets.get(cap)
  }
  const capOf = p => { const i = p.indexOf(':'); return i === -1 ? p : p.slice(0, i) }

  // fs.glob perms are stored as-is (cwd::pattern form) and matched at check time.
  const globBucket = { allow: [], deny: [] }
  for (const p of effective.allow) {
    if (p.startsWith('fs.glob:')) { globBucket.allow.push(p.slice('fs.glob:'.length)); continue }
    for (const expanded of expandPattern(p, ctx)) getBucket(capOf(expanded)).allow.push(expanded)
  }
  for (const p of effective.deny) {
    if (p.startsWith('fs.glob:')) { globBucket.deny.push(p.slice('fs.glob:'.length)); continue }
    for (const expanded of expandPattern(p, ctx)) getBucket(capOf(expanded)).deny.push(expanded)
  }

  const pvs = (list, cap) => {
    const n = cap.length + 1
    return list.reduce((acc, p) => { if (p.length > n) acc.push(p.slice(n)); return acc }, [])
  }
  const checkBatchAndThrow = (capability, value, matchFn) => {
    const b       = buckets.get(capability) ?? { allow: [], deny: [] }
    const allowed = b.allow.length > 0 && matchFn(pvs(b.allow, capability))
    const denied  = b.deny.length  > 0 && matchFn(pvs(b.deny,  capability))
    if (!allowed || denied) throw new PermissionError(capability, value)
  }

  const absDir = ctx?.dir?.replace(/\\/g, '/') ?? ''
  const globCtx = { pluginId: ctx?.pluginId ?? null, pluginDir: ctx?.pluginDir ?? null, dir: ctx?.dir ?? '' }

  return function checkPermission(capability, value, absCwd) {
    switch (capability) {
      case 'fs.read':
      case 'fs.write':
      case 'fs.exists': {
        const sub = s => s.startsWith('./') ? '__DOT__/' + s.slice(2) : s
        const v   = sub(value.replace(/\\/g, '/'))
        checkBatchAndThrow(capability, value, pvs => isGlobMatch(v, pvs.map(sub)))
        return
      }
      case 'fs.glob': {
        const resolvedCwd = (absCwd ?? absDir).replace(/\\/g, '/')
        const allowed = globBucket.allow.length > 0 && matchGlobPermission(value, resolvedCwd, globBucket.allow, globCtx)
        const denied  = globBucket.deny.length  > 0 && matchGlobPermission(value, resolvedCwd, globBucket.deny,  globCtx)
        if (!allowed || denied) throw new PermissionError(capability, value)
        return
      }
      case 'shell.run':
      case 'shell.job.start':
      case 'rune.run':
      case 'rune.repl':
      case 'rune.job.start':
      case 'db.connect': {
        checkBatchAndThrow(capability, value, pvs => isWildcardMatch(value.replace(/\\/g, '/'), pvs))
        return
      }
      // Capabilities whose value is always null — permission declared as bare capability name.
      case 'rune.job.kill':
      case 'rune.job.exists':
      case 'rune.job.read':
      case 'rune.job.write':
      case 'shell.job.kill':
      case 'shell.job.exists':
      case 'shell.job.read':
      case 'shell.job.write': {
        const b = buckets.get(capability)
        if (!b?.allow.length || b.deny.length > 0) throw new PermissionError(capability, '')
        return
      }
      case 'http.fetch':
        checkBatchAndThrow(capability, value, pvs => matchFetchPermission(value, pvs))
        return
      case 'env.read':
        checkBatchAndThrow(capability, value, pvs => matchEnvPermission(value, pvs))
        return
      case 'sqlite.read':
      case 'sqlite.write':
      case 'cache.read':
      case 'cache.write':
        checkBatchAndThrow(capability, value, pvs => matchStorePermission(value, pvs))
        return
      case 'ws.client':
        checkBatchAndThrow(capability, value, pvs => matchWsPermission(value, pvs))
        return
      case 'http.server': {
        const colonIdx = value.lastIndexOf(':')
        const host = colonIdx !== -1 ? value.slice(0, colonIdx) : value
        if (isLoopbackHost(host)) return
        checkBatchAndThrow(capability, value, pvs => matchHttpServerPermission(value, pvs))
        return
      }
      case 'ws.server': {
        const firstColon = value.indexOf(':')
        const host = firstColon !== -1 ? value.slice(0, firstColon) : value
        if (isLoopbackHost(host)) return
        checkBatchAndThrow(capability, value, pvs => matchWsServerPermission(value, pvs))
        return
      }
      default:
        throw new PermissionError(capability, value ?? '')
    }
  }
}
