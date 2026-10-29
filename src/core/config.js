import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getStorePath } from '../store/index.js'
import { isPathCommand } from '../shared/command.js'
import { isInlineSchema, normaliseJsonSchema } from '../rune/native/schema.js'
import { migrateEntry, v1EntryError } from './rune-entry.js'

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item)
}

export const LAYER = Symbol.for('crunes.layer')

const BLOCKS = ['run', 'args', 'repl']

/**
 * Resolve every file a config section names against the layer's own base dir, before layers
 * are merged, so a higher layer that overrides one field keeps the file the lower layer meant.
 * Rune entries name files in blocks; templates keep `path`, and the global layer's default
 * template path (`templates/<key>.js`).
 */
function absolutizeSection(section, kind, baseDir, layer) {
  const out = {}
  for (const [key, entry] of Object.entries(section)) {
    if (!isObject(entry)) { out[key] = entry; continue }
    const copy = { ...entry, [LAYER]: layer }
    if (kind === 'templates') {
      const isPluginRef = Boolean(entry.plugin) || key.includes(':')
      if (entry.path) copy.path = resolve(baseDir, entry.path)
      else if (layer === 'global' && !isPluginRef) copy.path = resolve(baseDir, `templates/${key}.js`)
      out[key] = copy
      continue
    }
    for (const block of BLOCKS) {
      if (entry[block] == null || (block === 'args' && isInlineSchema(entry[block]))) continue
      const b = typeof entry[block] === 'string' ? { command: entry[block] } : { ...entry[block] }
      // A run command may be a program on PATH; every other block names a file.
      if (typeof b.command === 'string' && (block !== 'run' || isPathCommand(b.command))) b.command = resolve(baseDir, b.command)
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
        // Blocks merge key by key, so a layer that only adds grants keeps the command.
        for (const block of BLOCKS) {
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
const RUN_BLOCK_KEYS = ['command', 'argv', 'permissions', 'output', 'pass', 'timeout']
const ARGS_FILE = /\.(rune\.m?js|json)$/i
const ARGS_BLOCK_KEYS = ['command', 'permissions']
const REPL_BLOCK_KEYS = ['command', 'permissions']

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

/** A plugin alias (`plugin`) or an override keyed `marketplace@plugin:rune`: it grants, it names no handler. */
function isPluginReference(runeKey, entry) {
  const runCommand = typeof entry.run === 'string' ? entry.run : entry.run?.command
  return entry.plugin != null || (runeKey.includes(':') && runCommand === undefined)
}

/**
 * Rules for a rune entry. A single layer may hold part of an entry — grants or vars for a rune
 * another layer declares — so `partial` skips only the checks that need the whole entry; the
 * merged config is checked in full.
 */
function validateEntry(runeKey, entry, fileName, partial) {
  const at = `runes["${runeKey}"]`

  if (isPluginReference(runeKey, entry)) {
    if (entry.plugin == null) {
      const pluginPart = runeKey.slice(0, runeKey.indexOf(':'))
      if (!pluginPart.includes('@')) {
        throw new Error(
          `${fileName}: ${at} is a plugin-rune override — but "${pluginPart}" is missing the marketplace ` +
          `prefix. Use the full "marketplace@plugin:${runeKey.slice(runeKey.indexOf(':') + 1)}" form.`
        )
      }
    }
    for (const name of ['run', 'repl']) {
      if (entry[name] == null) continue
      const b = validateBlockShape(`${at}.${name}`, entry[name], ['command', 'permissions'], fileName)
      if (b.command !== undefined) throw new Error(`${fileName}: ${at}.${name} — a plugin rune's handler comes from the plugin; this entry may only grant permissions`)
    }
    if (entry.args != null) throw new Error(`${fileName}: ${at}.args — a plugin rune's schema comes from the plugin`)
    return
  }

  const run = entry.run == null ? null : validateBlockShape(`${at}.run`, entry.run, RUN_BLOCK_KEYS, fileName)
  if (!partial && (run == null || run.command === undefined)) {
    throw new Error(
      `${fileName}: ${at} has no run block naming its command in any config layer — a rune runs only what its entry declares. ` +
      `An entry written for the old .crunes/runes/<key>.js convention is rewritten by \`crunes migrate\`.`
    )
  }
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

  if (run?.timeout !== undefined && !(typeof run.timeout === 'number' && Number.isFinite(run.timeout) && run.timeout > 0)) {
    throw new Error(`${fileName}: ${at}.run.timeout must be a number of seconds greater than 0`)
  }
  if (run?.pass !== undefined) {
    if (run.pass !== 'raw' && run.pass !== 'mapped') throw new Error(`${fileName}: ${at}.run.pass must be "raw" or "mapped"`)
    if (runIsIsolate) throw new Error(`${fileName}: ${at}.run.pass — an isolate module receives parsed arguments itself; pass applies to native handlers`)
    if (run.pass === 'mapped' && entry.args == null && !partial) {
      throw new Error(`${fileName}: ${at}.run.pass is "mapped" but the rune has no args block — mapped arguments are built from the schema`)
    }
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

  if (entry.repl != null) {
    const repl = validateBlockShape(`${at}.repl`, entry.repl, REPL_BLOCK_KEYS, fileName)
    if (repl.command === undefined && !partial) throw new Error(`${fileName}: ${at}.repl has no command in any config layer`)
    if (repl.command !== undefined && !ISOLATE_MODULE.test(repl.command)) {
      throw new Error(`${fileName}: ${at}.repl.command must be a *.rune.js module — a REPL runs in the isolate`)
    }
  }
}

/** Whole-entry checks, once every layer has been merged. */
export function validateMergedRunBlocks(config, label = 'config') {
  for (const [runeKey, entry] of Object.entries(config.runes ?? {})) {
    if (isObject(entry)) validateEntry(runeKey, entry, label, false)
  }
}

/**
 * Per-layer checks. base and layer, when given, let a v1 entry be refused with its rewrite:
 * the rewrite needs the layer's directory to find the file the v1 fallback would have used.
 */
export function validateConfig(config, fileName = 'config.json', { base = null, layer = 'project' } = {}) {
  if (config.runes && typeof config.runes === 'object') {
    for (const [runeKey, entry] of Object.entries(config.runes)) {
      if (!isObject(entry)) continue
      // Only explicit v1 fields are refused here: whether a block-less entry relied on the fallback
      // file cannot be told from one layer, and the merged check names the migration for it.
      const rewritten = (entry.path !== undefined || entry.permissions !== undefined)
        ? migrateEntry(entry, { base: base ?? '.', defaultFile: base ? defaultRuneFile(runeKey, layer) : null })
        : null
      if (rewritten) throw v1EntryError(fileName, `runes["${runeKey}"]`, rewritten)
      validateEntry(runeKey, entry, fileName, true)
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

/** Where the v1 fallback looked for a pathless rune in a layer. */
export function defaultRuneFile(runeKey, layer) {
  return runeKey.includes(':') ? null : layer === 'global' ? `runes/${runeKey}.js` : `.crunes/runes/${runeKey}.js`
}

export const ROOTLESS = Symbol.for('crunes.rootless')

function readLayer(filePath, label, base, layer) {
  if (!existsSync(filePath)) return null
  let parsed
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (err) {
    throw new Error(`${label} is invalid JSON: ${err.message}`)
  }
  validateConfig(parsed, label, { base, layer })
  return parsed
}

export function loadConfig(dir) {
  const layers = []

  if (process.env.CRUNES_NO_GLOBAL !== '1') {
    const storeRoot = getStorePath()
    const globalPath = join(storeRoot, 'config.json')
    const globalRaw = readLayer(globalPath, globalPath, storeRoot, 'global')
    if (globalRaw) layers.push(absolutizeEntryPaths(globalRaw, storeRoot, 'global'))
  }

  const sharedRaw = readLayer(join(dir, '.crunes', 'config.json'), 'config.json', dir, 'project')
  const rootless = sharedRaw === null

  if (sharedRaw) {
    layers.push(absolutizeEntryPaths(sharedRaw, dir, 'project'))
    const localRaw = readLayer(join(dir, '.crunes', 'config.local.json'), 'config.local.json', dir, 'local')
    if (localRaw) layers.push(absolutizeEntryPaths(localRaw, dir, 'local'))
  }

  const merged = layers.reduce((acc, layer) => mergeConfigs(acc, layer), {})
  validateMergedRunBlocks(merged, 'config (merged layers)')
  merged[ROOTLESS] = rootless
  return merged
}
