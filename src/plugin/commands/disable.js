import { loadConfig, enabledPluginKeys } from '../../core/config.js'
import { getConfigPath, setPluginEnabled } from '../../core/config-writer.js'

function resolveEnabledPluginKey(nameOrKey, enabledPlugins) {
  if (nameOrKey.includes('@')) return nameOrKey
  const matches = enabledPlugins.filter(k => k.slice(k.indexOf('@') + 1) === nameOrKey)
  if (matches.length > 1) {
    throw new Error(`Ambiguous plugin "${nameOrKey}". Use the full key: ${matches.join(', ')}`)
  }
  return matches[0] ?? null
}

export async function handler({ name, projectRoot, configRoot, global = false }) {
  try {
    const root = configRoot ?? projectRoot
    // Resolve against the merged set: a globally-enabled plugin is absent from
    // the project config, so the raw project file alone would not find it.
    const enabled = enabledPluginKeys(loadConfig(root))
    const pluginKey = resolveEnabledPluginKey(name, enabled)
    if (!pluginKey) throw new Error(`Plugin "${name}" is not enabled.`)
    await setPluginEnabled(getConfigPath({ configRoot: root, global }), pluginKey, false)
    console.log(`Plugin "${pluginKey}" disabled${global ? ' globally' : ' for this project'}.`)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
}
