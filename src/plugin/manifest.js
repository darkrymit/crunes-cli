import fs from 'node:fs/promises'
import path from 'node:path'
import { migrateEntry } from '../core/rune-entry.js'

const PLUGIN_JSON_RELATIVE = '.crunes-plugin/plugin.json'

export async function loadPluginJson(pluginDir) {
  const jsonPath = path.join(pluginDir, PLUGIN_JSON_RELATIVE)
  const raw = await fs.readFile(jsonPath, 'utf8')
  const json = JSON.parse(raw)
  validatePluginJson(json, pluginDir)
  return json
}

const ISOLATE_MODULE = /\.rune\.m?js$/i
const RUNE_BLOCK_KEYS = { run: ['command', 'permissions'], repl: ['command', 'permissions'] }

/**
 * A plugin rune names its handlers in blocks, as a project rune does: `run` (required) and an
 * optional `repl`, each an isolate module relative to the plugin root, with the grants for it.
 */
export function validatePluginJson(json, pluginDir = null) {
  if (json.format === '1') {
    const first = Object.entries(json.runes ?? {}).find(([, rune]) => rune && typeof rune === 'object')
    const example = first && pluginDir
      ? migrateEntry(first[1], { base: pluginDir, defaultFile: `runes/${first[0]}.js` })
      : null
    throw new Error(
      `plugin.json: manifest format "1" is no longer read — runes now name their module in a run block ` +
      `(and a repl block for a REPL), with grants inside each block.` +
      (example ? `\nRune "${first[0]}" rewritten:\n\n${JSON.stringify(example.entry, null, 2).replace(/^/gm, '  ')}\n` : '') +
      `\nRun \`crunes migrate --plugin <plugin-dir>\` to rewrite the manifest as format "2" and rename the modules.`
    )
  }
  if (json.format !== '2') throw new Error(`plugin.json: unsupported format "${json.format}" (expected "2")`)
  if (!json.runes || typeof json.runes !== 'object') throw new Error('plugin.json: "runes" must be an object')

  for (const [key, rune] of Object.entries(json.runes)) {
    const at = `plugin.json: rune "${key}"`
    if (!rune || typeof rune !== 'object' || Array.isArray(rune)) throw new Error(`${at} must be an object`)
    for (const old of ['path', 'permissions']) {
      if (rune[old] !== undefined) throw new Error(`${at} has "${old}" — format "2" names the module and its grants in the run and repl blocks`)
    }
    if (rune.run == null) throw new Error(`${at} has no run block`)
    for (const mode of ['run', 'repl']) {
      if (rune[mode] == null) continue
      const block = typeof rune[mode] === 'string' ? { command: rune[mode] } : rune[mode]
      if (typeof block !== 'object' || Array.isArray(block)) throw new Error(`${at}: ${mode} must be a module path or { "command", "permissions" }`)
      const unknown = Object.keys(block).filter(k => !RUNE_BLOCK_KEYS[mode].includes(k))
      if (unknown.length) throw new Error(`${at}: ${mode} has unknown field ${unknown.map(k => `"${k}"`).join(', ')}`)
      if (typeof block.command !== 'string' || !ISOLATE_MODULE.test(block.command)) {
        throw new Error(`${at}: ${mode}.command must be a *.rune.js module in the plugin`)
      }
      const perms = block.permissions
      if (perms != null && (typeof perms !== 'object' || Array.isArray(perms) || Object.keys(perms).some(k => k !== 'allow' && k !== 'deny'))) {
        throw new Error(`${at}: ${mode}.permissions must be { "allow": [...], "deny": [...] }`)
      }
    }
  }
}
