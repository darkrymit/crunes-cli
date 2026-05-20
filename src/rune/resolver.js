import { join } from 'node:path'
import { loadRegistry, resolvePluginKey } from '../plugin/registry.js'
import { loadPluginJson } from '../plugin/manifest.js'
import { executePluginRune, runRuneInIsolate } from './isolation/runner.js'
import { computeEffectivePermissions } from './permissions/permissions.js'
import { CircularRuneError } from '../core/errors.js'

export function normaliseRune(entry) {
  return entry
}

export function getRune(config, key) {
  const raw = (config.runes ?? {})[key]
  if (raw == null) return null
  return normaliseRune(raw)
}

async function resolvePluginRune(config, key) {
  const colonIdx = key.indexOf(':')
  if (colonIdx === -1) return null

  const enabledPlugins = config.plugins ?? []
  if (enabledPlugins.length === 0) return null

  const pluginPart = key.slice(0, colonIdx)
  const runeKey    = key.slice(colonIdx + 1)

  let registry
  try {
    registry = await loadRegistry()
  } catch {
    return null
  }

  const pluginKey = resolvePluginKey(pluginPart, registry)
  if (!pluginKey) return null

  if (!enabledPlugins.includes(pluginKey)) return null

  const entry = registry.plugins?.[pluginKey]
  if (!entry) return null

  return { pluginKey, runeKey, pluginDir: entry.path }
}

async function resolveRuneFromPlugins(config, runeKey) {
  const enabledPlugins = config.plugins ?? []
  if (enabledPlugins.length === 0) return null

  let registry
  try { registry = await loadRegistry() } catch { return null }

  const matches = []
  for (const pluginKey of enabledPlugins) {
    const entry = registry.plugins?.[pluginKey]
    if (!entry) continue
    let pluginJson
    try { pluginJson = await loadPluginJson(entry.path) } catch { continue }
    if ((pluginJson.runes ?? {})[runeKey]) {
      matches.push({ pluginKey, runeKey, pluginDir: entry.path, pluginJson })
    }
  }

  if (matches.length > 1) {
    const names = matches.map(m => m.pluginKey.slice(m.pluginKey.indexOf('@') + 1)).join(', ')
    throw new Error(`"${runeKey}" matches runes in multiple plugins: ${names}. Use plugin:${runeKey} to specify one.`)
  }
  return matches[0] ?? null
}

export async function runRune(dir, config, key, args, opts = {}, _callStack = []) {
  const configDir = opts.configDir ?? dir

  let localOnly = false
  if (key.startsWith('project:')) {
    key = key.slice(8)
    localOnly = true
  }

  if (_callStack.includes(key)) {
    throw new CircularRuneError([..._callStack, key])
  }

  const nextStack = [..._callStack, key]
  const runeCallback = (childKey, childArgs) => runRune(dir, config, childKey, childArgs, { configDir }, nextStack)

  const pluginMatch = localOnly ? null : await resolvePluginRune(config, key)
  if (pluginMatch) {
    const { pluginKey, runeKey, pluginDir } = pluginMatch
    const pluginJson   = await loadPluginJson(pluginDir)
    const projectPerms = config.permissions?.[`${pluginKey}:${runeKey}`]
    const projectVars  = config.vars?.[`${pluginKey}:${runeKey}`] ?? {}
    const result = await executePluginRune({
      pluginDir, runeKey, pluginJson, projectPerms, projectVars, args,
      projectDir: dir, opts: config, runeCallback,
      sections: opts.sections ?? null,
      lifecycle: 'use',
    })
    return normaliseResult(result)
  }

  const entry = getRune(config, key)

  if (!entry && !localOnly) {
    const autoMatch = await resolveRuneFromPlugins(config, key)
    if (autoMatch) {
      const { pluginKey, runeKey, pluginDir, pluginJson } = autoMatch
      const projectPerms = config.permissions?.[`${pluginKey}:${runeKey}`]
      const projectVars  = config.vars?.[`${pluginKey}:${runeKey}`] ?? {}
      const result = await executePluginRune({
        pluginDir, runeKey, pluginJson, projectPerms, projectVars, args,
        projectDir: dir, opts: config, runeCallback,
        sections: opts.sections ?? null,
        lifecycle: 'use',
      })
      return normaliseResult(result)
    }
    return null
  }

  if (!entry) return null

  if (entry.plugin) {
    const aliasMatch = await resolvePluginRune(config, entry.plugin)
    if (!aliasMatch) throw new Error(`Plugin alias "${key}" → "${entry.plugin}" is not enabled or installed.`)
    const { pluginKey, runeKey, pluginDir } = aliasMatch
    const pluginJson   = await loadPluginJson(pluginDir)
    const projectPerms = entry.permissions ?? config.permissions?.[`${pluginKey}:${runeKey}`]
    const projectVars  = entry.vars ?? config.vars?.[`${pluginKey}:${runeKey}`] ?? {}
    const result = await executePluginRune({
      pluginDir, runeKey, pluginJson, projectPerms, projectVars, args,
      projectDir: dir, opts: config, runeCallback,
      sections: opts.sections ?? null,
      lifecycle: 'use',
    })
    return normaliseResult(result)
  }

  const fullPath = join(configDir, entry.path ?? `.crunes/runes/${key}.js`)
  const basePerms = entry.permissions ?? { allow: [], deny: [] }
  const effective = computeEffectivePermissions(basePerms, config.permissions?.[key], 'use')
  const result = await runRuneInIsolate(fullPath, effective, args, dir, {
    runeCallback,
    sections: opts.sections ?? null,
    vars: entry.vars ?? {},
    lifecycle: 'use',
  })
  return normaliseResult(result)
}

function normaliseResult(result) {
  if (result == null) return []
  if (Array.isArray(result)) return result
  return [result]
}
