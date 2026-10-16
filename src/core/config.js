import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getStorePath } from '../store/index.js'
import { isPathCommand } from '../shared/command.js'
import { isInlineSchema, normaliseJsonSchema } from '../rune/native/schema.js'

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
    else if (layer === 'global' && !isPluginRef && entry.run == null) copy.path = resolve(baseDir, `${kind}/${key}.js`)
    for (const block of ['run', 'args']) {
      if (entry[block] == null || (block === 'args' && isInlineSchema(entry[block]))) continue
      const b = typeof entry[block] === 'string' ? { command: entry[block] } : { ...entry[block] }
      // A run command may be a program on PATH; an args command is always a file.
      if (typeof b.command === 'string' && (block === 'args' || isPathCommand(b.command))) b.command = resolve(baseDir, b.command)
      copy[block] = b
    }
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
        // run and args blocks merge key by key, so a layer that only adds grants keeps the command.
        for (const block of ['run', 'args']) {
          if (isObject(sharedEntry[block]) && isObject(localEntry[block]) &&
              !isInlineSchema(sharedEntry[block]) && !isInlineSchema(localEntry[block])) {
            merged.runes[key][block] = { ...sharedEntry[block], ...localEntry[block] }
          }
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

const ISOLATE_MODULE = /\.rune\.m?js$/i
const RUN_BLOCK_KEYS = ['command', 'argv', 'permissions', 'output']
const ARGS_FILE = /\.(rune\.m?js|json)$/i
const ARGS_BLOCK_KEYS = ['command', 'permissions']

function validateBlockShape(where, block, allowedKeys, fileName) {
  if (typeof block === 'string') {
    if (block === '') throw new Error(`${fileName}: ${where} must not be empty`)
    return { command: block }
  }
  if (!isObject(block)) throw new Error(`${fileName}: ${where} must be a command string or an object with "command"`)
  const unknown = Object.keys(block).filter(k => !allowedKeys.includes(k))
  if (unknown.length) {
    throw new Error(`${fileName}: ${where} has unknown field${unknown.length > 1 ? 's' : ''} ${unknown.map(k => `"${k}"`).join(', ')} — allowed: ${allowedKeys.join(', ')}`)
  }
  if (block.command !== undefined && (typeof block.command !== 'string' || block.command === '')) {
    throw new Error(`${fileName}: ${where}.command must be a non-empty string`)
  }
  if (block.permissions != null) {
    const p = block.permissions
    if (!isObject(p) || Object.keys(p).some(k => k !== 'allow' && k !== 'deny')) {
      throw new Error(`${fileName}: ${where}.permissions must be { "allow": [...], "deny": [...] } — grants in a block are not scoped by lifecycle`)
    }
  }
  return block
}

/**
 * Rules for an entry declared with run/args blocks. Entries with "path" keep their existing rules.
 * A single layer may hold part of an entry — grants for a command another layer declares — so
 * `partial` skips only the checks that need the whole entry; the merged config is checked in full.
 */
function validateRunBlocks(runeKey, entry, fileName, partial) {
  const at = `runes["${runeKey}"]`
  if (entry.run == null) {
    if (!partial) throw new Error(`${fileName}: ${at} has an "args" block but no "run" block`)
  } else {
    if (entry.path != null) throw new Error(`${fileName}: ${at} declares both "path" and "run" — a rune names its handler with one of them`)
    if (entry.plugin != null) throw new Error(`${fileName}: ${at} declares both "plugin" and "run" — an alias cannot also have a handler`)
    if (entry.permissions != null) {
      throw new Error(`${fileName}: ${at}.permissions is not used by a rune with a run block — put grants in run.permissions (and args.permissions for an args module)`)
    }
  }

  const run = entry.run == null ? null : validateBlockShape(`${at}.run`, entry.run, RUN_BLOCK_KEYS, fileName)
  if (run && run.command === undefined && !partial) throw new Error(`${fileName}: ${at}.run has no command in any config layer`)
  if (run?.argv != null && (!Array.isArray(run.argv) || run.argv.some(a => typeof a !== 'string'))) {
    throw new Error(`${fileName}: ${at}.run.argv must be an array of strings`)
  }
  const runIsIsolate = run?.command !== undefined && ISOLATE_MODULE.test(run.command)
  if (run?.permissions != null && run.command !== undefined && !runIsIsolate) {
    throw new Error(`${fileName}: ${at}.run.permissions — "${run.command}" runs natively with full access, so grants would not apply to it. Remove the block, or use a *.rune.js module to run in the sandbox`)
  }
  if (run?.output !== undefined) {
    if (run.output !== 'text' && run.output !== 'sections') throw new Error(`${fileName}: ${at}.run.output must be "text" or "sections"`)
    if (runIsIsolate) throw new Error(`${fileName}: ${at}.run.output — an isolate module returns sections itself; output applies to native handlers`)
  }

  if (entry.args != null && isInlineSchema(entry.args)) {
    try { normaliseJsonSchema(entry.args, `${at}.args`) } catch (err) { throw new Error(`${fileName}: ${err.message}`) }
    if (runIsIsolate) {
      throw new Error(`${fileName}: ${at}.args — an isolate run module declares its schema with its own args export; an args block is for native handlers`)
    }
  } else if (entry.args != null) {
    const args = validateBlockShape(`${at}.args`, entry.args, ARGS_BLOCK_KEYS, fileName)
    if (args.command === undefined && !partial) throw new Error(`${fileName}: ${at}.args has no command in any config layer`)
    if (args.command !== undefined && !ARGS_FILE.test(args.command)) {
      throw new Error(`${fileName}: ${at}.args.command must be a *.rune.js module exporting args(builder), or a .json schema`)
    }
    if (runIsIsolate) {
      throw new Error(`${fileName}: ${at}.args — an isolate run module declares its schema with its own args export; an args block is for native handlers`)
    }
  }
}

/** Whole-entry checks for run/args blocks, once every layer has been merged. */
export function validateMergedRunBlocks(config, label = 'config') {
  for (const [runeKey, entry] of Object.entries(config.runes ?? {})) {
    if (entry && typeof entry === 'object' && (entry.run != null || entry.args != null)) {
      validateRunBlocks(runeKey, entry, label, false)
    }
  }
}

export function validateConfig(config, fileName = 'config.json') {
  if (config.runes && typeof config.runes === 'object') {
    for (const [runeKey, entry] of Object.entries(config.runes)) {
      if (entry && typeof entry === 'object' && (entry.run != null || entry.args != null)) {
        validateRunBlocks(runeKey, entry, fileName, true)
      }

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
  validateMergedRunBlocks(merged, 'config (merged layers)')
  merged[ROOTLESS] = rootless
  return merged
}
