import { loadRegistry, resolvePluginKey } from '../registry.js'
import { getConfigPath, setPluginEnabled } from '../../core/config-writer.js'

export async function handler({ name, projectRoot, configRoot, global = false }) {
  try {
    const registry = await loadRegistry()
    const pluginKey = resolvePluginKey(name, registry)
    if (!pluginKey) throw new Error(`Plugin "${name}" is not installed. Run: crunes plugin list`)
    await setPluginEnabled(getConfigPath({ configRoot: configRoot ?? projectRoot, global }), pluginKey, true)
    console.log(`Plugin "${pluginKey}" enabled${global ? ' globally' : ''}.`)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
}
