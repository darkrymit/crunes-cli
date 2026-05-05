import fs from 'node:fs/promises'
import path from 'node:path'

const PLUGIN_JSON_RELATIVE = '.crunes-plugin/plugin.json'

export async function loadPluginJson(pluginDir) {
  const jsonPath = path.join(pluginDir, PLUGIN_JSON_RELATIVE)
  const raw = await fs.readFile(jsonPath, 'utf8')
  const json = JSON.parse(raw)
  validatePluginJson(json)
  return json
}

export function validatePluginJson(json) {
  if (json.format !== '1') throw new Error(`plugin.json: unsupported format "${json.format}" (expected "1")`)
  if (!json.name || typeof json.name !== 'string') throw new Error('plugin.json: "name" is required and must be a string')
  if (!json.version || typeof json.version !== 'string') throw new Error('plugin.json: "version" is required')
  if (!json.runes || typeof json.runes !== 'object') throw new Error('plugin.json: "runes" must be an object')

  for (const [key, rune] of Object.entries(json.runes)) {
    const perms = rune.permissions ?? {}
    const hasLifecycleScoped = Object.values(perms).some(v => v && Array.isArray(v.allow))
    if (!hasLifecycleScoped) {
      throw new Error(`plugin.json: rune "${key}" must have lifecycle-scoped permissions (e.g. permissions.use.allow)`)
    }
  }
}
