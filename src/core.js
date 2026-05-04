import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadRegistry, resolvePluginKey } from './plugins/registry.js'
import { loadPluginJson } from './plugins/manifest.js'
import { executePluginRune, runRuneInIsolate } from './isolation/runner.js'
import { computeEffectivePermissions } from './isolation/permissions.js'

export class CircularRuneError extends Error {
  constructor(chain) {
    super(`Circular rune call: ${chain.join(' → ')}`)
    this.name = 'CircularRuneError'
  }
}

export function loadConfig(dir) {
  const configPath = join(dir, '.crunes', 'config.json')
  return JSON.parse(readFileSync(configPath, 'utf8'))
}

/**
 * Normalises a rune config entry. Entries must be objects with either
 * a `path` field (local rune) or a `plugin` field (plugin alias).
 */
export function normaliseRune(entry) {
  return entry
}

/**
 * Returns the normalised entry for a key, or null if not found.
 */
export function getRune(config, key) {
  const raw = (config.runes ?? {})[key]
  if (raw == null) return null
  return normaliseRune(raw)
}

/**
 * Resolves a namespaced key ("marketplace@plugin:runeKey") to a plugin rune descriptor.
 * Returns null for local rune keys (no colon) without touching disk.
 */
async function resolvePluginRune(config, key) {
  // Local rune keys never contain ':' — short-circuit before any disk I/O
  const colonIdx = key.indexOf(':')
  if (colonIdx === -1) return null

  const enabledPlugins = config.plugins ?? []
  if (enabledPlugins.length === 0) return null

  // key format: "marketplace@plugin:runeKey" or bare "plugin:runeKey"
  const pluginPart = key.slice(0, colonIdx)
  const runeKey    = key.slice(colonIdx + 1)

  let registry
  try {
    registry = await loadRegistry()
  } catch {
    return null
  }

  // Resolve bare name → full marketplace@plugin key (throws if ambiguous)
  const pluginKey = resolvePluginKey(pluginPart, registry)
  if (!pluginKey) return null

  if (!enabledPlugins.includes(pluginKey)) return null

  const entry = registry.plugins?.[pluginKey]
  if (!entry) return null

  return { pluginKey, runeKey, pluginDir: entry.path }
}

/**
 * Searches all enabled plugins for a rune with the given bare name.
 * Returns a plugin match descriptor, or null if not found.
 * Throws if the name matches runes in multiple plugins (ambiguous).
 */
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

/**
 * Runs a rune and returns a Section[] array.
 * Routes to isolated-vm execution for plugin runes, in-process for local runes.
 * Returns null if key not in config and not found in any enabled plugin.
 *
 * Key resolution order for a bare name (no prefix):
 *   1. project config (config.runes)
 *   2. enabled plugins (auto-resolve; errors if ambiguous)
 *
 * Prefix `local:name` forces resolution from project config only.
 * Prefix `plugin:name` resolves directly from that plugin.
 *
 * @param {object}   opts       - { sections: string[]|null } — section filter hint
 * @param {string[]} _callStack - internal; tracks the call chain for circular detection
 */
export async function runRune(dir, config, key, args, opts = {}, _callStack = []) {
  // Strip `local:` prefix — forces resolution from project config only, skips plugin rune lookup
  let localOnly = false
  if (key.startsWith('local:')) {
    key = key.slice(6)
    localOnly = true
  }

  if (_callStack.includes(key)) {
    throw new CircularRuneError([..._callStack, key])
  }

  const nextStack = [..._callStack, key]
  // Child runes called via utils.rune() do not inherit the section filter
  const runeCallback = (childKey, childArgs) => runRune(dir, config, childKey, childArgs, {}, nextStack)

  // Check if the key itself is a namespaced plugin rune ("marketplace@plugin:runeKey")
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

  // Auto-resolve bare name from enabled plugins when not in project config
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

  // Plugin alias — entry has a `plugin` field pointing to a plugin rune
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

  // Local rune — always isolated
  const fullPath = join(dir, entry.path)
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
