import fs from 'node:fs/promises'
import path from 'node:path'
import { isInlineSchema, normaliseJsonSchema } from '../rune/native/schema.js'

const PLUGIN_JSON_RELATIVE = '.crunes-plugin/plugin.json'

export async function loadPluginJson(pluginDir) {
  const jsonPath = path.join(pluginDir, PLUGIN_JSON_RELATIVE)
  const raw = await fs.readFile(jsonPath, 'utf8')
  const json = JSON.parse(raw)
  validatePluginJson(json, pluginDir)
  return json
}

const ISOLATE_MODULE = /\.rune\.m?js$/i
const ARGS_FILE = /\.(rune\.m?js|json)$/i
const RUNE_BLOCK_KEYS = {
  run: ['command', 'argv', 'permissions', 'output', 'pass', 'timeout'],
  repl: ['command', 'permissions'],
}

export function validatePluginJson(json, pluginDir = null) {
  if (json.format !== '1') throw new Error(`plugin.json: unsupported format "${json.format}" (expected "1")`)
  if (!json.runes || typeof json.runes !== 'object') throw new Error('plugin.json: "runes" must be an object')

  for (const [key, rune] of Object.entries(json.runes)) {
    const at = `plugin.json: rune "${key}"`
    if (!rune || typeof rune !== 'object' || Array.isArray(rune)) throw new Error(`${at} must be an object`)
    for (const old of ['path', 'permissions']) {
      if (rune[old] !== undefined) throw new Error(`${at} has "${old}" — a plugin manifest names the module and its grants in the run and repl blocks`)
    }
    if (rune.run == null) throw new Error(`${at} has no run block`)
    for (const mode of ['run', 'repl']) {
      if (rune[mode] == null) continue
      const block = typeof rune[mode] === 'string' ? { command: rune[mode] } : rune[mode]
      if (typeof block !== 'object' || Array.isArray(block)) throw new Error(`${at}: ${mode} must be a module path or { "command", "permissions" }`)
      const unknown = Object.keys(block).filter(k => !RUNE_BLOCK_KEYS[mode].includes(k))
      if (unknown.length) throw new Error(`${at}: ${mode} has unknown field ${unknown.map(k => `"${k}"`).join(', ')}`)
      if (typeof block.command !== 'string' || block.command === '') throw new Error(`${at}: ${mode}.command must be a non-empty string`)
      const isolate = ISOLATE_MODULE.test(block.command)
      if (mode === 'repl' && !isolate) throw new Error(`${at}: repl.command must be a *.rune.js module in the plugin`)
      const perms = block.permissions
      if (perms != null && !isolate) {
        throw new Error(`${at}: ${mode}.permissions — "${block.command}" runs natively with full access, so grants would not apply to it`)
      }
      if (perms != null && (typeof perms !== 'object' || Array.isArray(perms) || Object.keys(perms).some(k => k !== 'allow' && k !== 'deny'))) {
        throw new Error(`${at}: ${mode}.permissions must be { "allow": [...], "deny": [...] }`)
      }
      if (isolate && ['argv', 'output', 'pass'].some(k => block[k] !== undefined)) {
        throw new Error(`${at}: ${mode} — argv, output and pass apply to a native handler, not an isolate module`)
      }
    }
    // A native rune may carry an argument schema, as a project script rune does.
    if (rune.args != null) {
      const run = typeof rune.run === 'string' ? { command: rune.run } : rune.run
      if (ISOLATE_MODULE.test(run.command)) throw new Error(`${at}: args — an isolate module declares its schema with its own args export`)
      if (isInlineSchema(rune.args)) {
        try { normaliseJsonSchema(rune.args, `rune "${key}" args`) } catch (err) { throw new Error(`plugin.json: ${err.message}`) }
      } else {
        const args = typeof rune.args === 'string' ? { command: rune.args } : rune.args
        if (typeof args.command !== 'string' || !ARGS_FILE.test(args.command)) {
          throw new Error(`${at}: args.command must be a *.rune.js module exporting args(builder), or a .json schema`)
        }
      }
    }
  }
}
