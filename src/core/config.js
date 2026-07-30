import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getStorePath } from '../store/index.js'

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item)
}

export const LAYER = Symbol.for('crunes.layer')

/**
 * Resolve every `path` in a config section against the layer's own base dir,
 * before layers are merged. Only the global layer fills in a default path
 * (`runes/<key>.js`) — project entries stay pathless so that an entry which
 * only overrides `vars` inherits the path of the layer that defined it.
 */
function absolutizeSection(section, kind, baseDir, layer) {
  const out = {}
  for (const [key, entry] of Object.entries(section)) {
    if (!isObject(entry)) { out[key] = entry; continue }
    const copy = { ...entry, [LAYER]: layer }
    const isPluginRef = Boolean(entry.plugin) || key.includes(':')
    if (entry.path) copy.path = resolve(baseDir, entry.path)
    else if (layer === 'global' && !isPluginRef) copy.path = resolve(baseDir, `${kind}/${key}.js`)
    out[key] = copy
  }
  return out
}

export function absolutizeEntryPaths(config, baseDir, layer) {
  const out = { ...config }
  if (isObject(config.runes))     out.runes     = absolutizeSection(config.runes, 'runes', baseDir, layer)
  if (isObject(config.templates)) out.templates = absolutizeSection(config.templates, 'templates', baseDir, layer)
  return out
}

export function coercePlugins(plugins) {
  if (Array.isArray(plugins)) return Object.fromEntries(plugins.map(k => [k, true]))
  return isObject(plugins) ? { ...plugins } : {}
}

export function enabledPluginKeys(config) {
  return Object.entries(coercePlugins(config?.plugins))
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => key)
}

export function mergeConfigs(shared, local) {
  const merged = { ...shared }

  // 1. Merge Top-level Primitives & simple keys
  for (const [key, value] of Object.entries(local)) {
    if (key !== 'runes' && key !== 'templates' && key !== 'plugins') {
      merged[key] = value
    }
  }

  // 2. Merge 'runes'
  if (local.runes) {
    merged.runes = { ...shared.runes }
    for (const [key, localEntry] of Object.entries(local.runes)) {
      const sharedEntry = shared.runes?.[key]
      if (sharedEntry && isObject(sharedEntry) && isObject(localEntry)) {
        merged.runes[key] = {
          ...sharedEntry,
          ...localEntry,
          vars: { ...sharedEntry.vars, ...localEntry.vars }
        }
      } else {
        merged.runes[key] = localEntry
      }
    }
  }

  // 2b. Merge 'templates' (same shape as runes, no vars)
  if (local.templates) {
    merged.templates = { ...shared.templates }
    for (const [key, localEntry] of Object.entries(local.templates)) {
      const sharedEntry = shared.templates?.[key]
      merged.templates[key] = (isObject(sharedEntry) && isObject(localEntry))
        ? { ...sharedEntry, ...localEntry }
        : localEntry
    }
  }

  // 3. Merge 'plugins' (boolean map, last layer wins per key)
  if (shared.plugins || local.plugins) {
    merged.plugins = { ...coercePlugins(shared.plugins), ...coercePlugins(local.plugins) }
  }

  return merged
}

export function validateConfig(config, fileName = 'config.json') {
  if (config.runes && typeof config.runes === 'object') {
    for (const [runeKey, entry] of Object.entries(config.runes)) {
      if (entry && typeof entry === 'object' && entry.permissions) {
        const perms = entry.permissions
        if (Array.isArray(perms)) {
          throw new Error(`${fileName}: runes["${runeKey}"].permissions must be lifecycle-scoped (e.g. permissions.run.allow)`)
        }
        if (perms && typeof perms === 'object') {
          if (Array.isArray(perms.allow) || Array.isArray(perms.deny)) {
            throw new Error(`${fileName}: runes["${runeKey}"].permissions must be lifecycle-scoped (e.g. permissions.run.allow)`)
          }
          if (perms.run && typeof perms.run === 'object' && Object.keys(perms.run).length === 0) {
            console.warn(`[crunes:warn] ${fileName}: runes["${runeKey}"].permissions.run is empty. No extra permissions will be granted.`)
          }
        }
      }

      if (entry && typeof entry === 'object' && !entry.path && !entry.plugin) {
        const colonIdx = runeKey.indexOf(':')
        if (colonIdx !== -1) {
          const pluginPart = runeKey.slice(0, colonIdx)
          if (!pluginPart.includes('@')) {
            throw new Error(
              `${fileName}: runes["${runeKey}"] has no path or plugin, so it can only be a plugin-rune ` +
              `override — but "${pluginPart}" is missing the marketplace prefix. Use the full ` +
              `"marketplace@plugin:${runeKey.slice(colonIdx + 1)}" form.`
            )
          }
        }
      }
    }
  }

  if (config.plugins && !Array.isArray(config.plugins) && typeof config.plugins === 'object') {
    for (const [key, value] of Object.entries(config.plugins)) {
      if (typeof value !== 'boolean') {
        throw new Error(`${fileName}: plugins["${key}"] must be true or false, got ${JSON.stringify(value)}`)
      }
    }
  }
}

export const ROOTLESS = Symbol.for('crunes.rootless')

function readLayer(filePath, label) {
  if (!existsSync(filePath)) return null
  let parsed
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (err) {
    throw new Error(`${label} is invalid JSON: ${err.message}`)
  }
  validateConfig(parsed, label)
  return parsed
}

export function loadConfig(dir) {
  const layers = []

  if (process.env.CRUNES_NO_GLOBAL !== '1') {
    const storeRoot = getStorePath()
    const globalPath = join(storeRoot, 'config.json')
    const globalRaw = readLayer(globalPath, globalPath)
    if (globalRaw) layers.push(absolutizeEntryPaths(globalRaw, storeRoot, 'global'))
  }

  const sharedRaw = readLayer(join(dir, '.crunes', 'config.json'), 'config.json')
  const rootless = sharedRaw === null

  if (sharedRaw) {
    layers.push(absolutizeEntryPaths(sharedRaw, dir, 'project'))
    const localRaw = readLayer(join(dir, '.crunes', 'config.local.json'), 'config.local.json')
    if (localRaw) layers.push(absolutizeEntryPaths(localRaw, dir, 'local'))
  }

  const merged = layers.reduce((acc, layer) => mergeConfigs(acc, layer), {})
  merged[ROOTLESS] = rootless
  return merged
}
