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
  if (!json.runes || typeof json.runes !== 'object') throw new Error('plugin.json: "runes" must be an object')

  for (const [key, rune] of Object.entries(json.runes)) {
    if (!rune.permissions || Object.keys(rune.permissions).length === 0) {
      continue
    }
    const perms = rune.permissions
    if (Array.isArray(perms)) {
      throw new Error(`plugin.json: rune "${key}" permissions must be lifecycle-scoped (e.g. permissions.use.allow)`)
    }
    if (perms.allow || perms.deny) {
      throw new Error(`plugin.json: rune "${key}" permissions must be lifecycle-scoped (e.g. permissions.use.allow)`)
    }
    const hasLifecycleScoped = Object.values(perms).some(v => v && Array.isArray(v.allow))
    if (!hasLifecycleScoped) {
      const hasEmptyUse = perms.use && typeof perms.use === 'object' && Object.keys(perms.use).length === 0
      if (hasEmptyUse) {
        console.warn(`[crunes:warn] plugin.json: rune "${key}" permissions.use is empty.`)
        continue
      }
      throw new Error(`plugin.json: rune "${key}" must have lifecycle-scoped permissions (e.g. permissions.use.allow)`)
    }
  }
}
