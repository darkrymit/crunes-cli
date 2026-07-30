import { getRune } from './resolver.js'
import { enabledPluginKeys } from '../core/config.js'

/**
 * Enumerate every rune visible to a project: local config runes first, then
 * runes from enabled plugins keyed `<shortPluginName>:<runeKey>`.
 * Shared by `crunes list` and `crunes docs rune` (global index) so the two
 * cannot disagree on what counts as a rune.
 */
export async function enumerateRunes(config) {
  const runes = config?.runes ?? {}
  const entries = []

  for (const key of Object.keys(runes)) {
    const entry = getRune(config, key)
    const source = entry.plugin ? `→ ${entry.plugin}` : (entry.path ?? '')
    entries.push({ key, source, name: entry.name ?? null, description: entry.description ?? null })
  }

  const enabledPlugins = enabledPluginKeys(config)
  if (enabledPlugins.length > 0) {
    try {
      const { loadRegistry } = await import('../plugin/registry.js')
      const { loadPluginJson } = await import('../plugin/manifest.js')
      const registry = await loadRegistry()
      for (const pluginKey of enabledPlugins) {
        const entry = registry.plugins?.[pluginKey]
        if (!entry) continue
        let pluginJson
        try {
          pluginJson = await loadPluginJson(entry.path)
        } catch {
          continue
        }

        for (const [runeKey, runeEntry] of Object.entries(pluginJson.runes ?? {})) {
          const idx = pluginKey.indexOf('@')
          const shortName = idx !== -1 ? pluginKey.slice(idx + 1) : pluginKey
          const displayKey = `${shortName}:${runeKey}`

          if (!entries.some(e => e.key === displayKey)) {
            entries.push({
              key: displayKey,
              source: `plugin: ${pluginKey}`,
              name: runeEntry.name ?? null,
              description: runeEntry.description ?? null,
            })
          }
        }
      }
    } catch {
      // Registry unavailable — local runes are still a useful answer.
    }
  }

  return entries
}
