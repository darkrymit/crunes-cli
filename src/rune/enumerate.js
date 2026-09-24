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

  // A key of the form `marketplace@plugin:rune` is an override of a plugin's rune —
  // extra vars or permissions for it — not a rune of its own. Listing it produces a
  // blank duplicate beside the plugin's own row, so it is held back and only emitted
  // below if the plugin never supplies that row (disabled, missing, or unreadable).
  const overrideKeys = []

  for (const key of Object.keys(runes)) {
    if (/@[^:]+:/.test(key)) { overrideKeys.push(key); continue }
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

  // An override whose plugin rune never appeared would otherwise vanish silently,
  // leaving config that does something invisible in every listing.
  for (const key of overrideKeys) {
    const runeKey = key.slice(key.lastIndexOf(':') + 1)
    const shortName = key.slice(key.indexOf('@') + 1, key.lastIndexOf(':'))
    if (entries.some(e => e.key === `${shortName}:${runeKey}`)) continue
    const entry = getRune(config, key)
    entries.push({ key, source: entry.path ?? '', name: entry.name ?? null, description: entry.description ?? null })
  }

  return entries
}
