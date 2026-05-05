import * as p from '@clack/prompts'
import { loadRegistry, resolvePluginKey } from '../registry.js'
import { uninstallPlugin } from '../install.js'

export async function handler({ name, yes, projectRoot }) {
  let pluginKey
  try {
    const registry = await loadRegistry()
    pluginKey = resolvePluginKey(name, registry)
    if (!pluginKey) throw new Error(`Plugin "${name}" is not installed. Run: crunes plugin list`)
  } catch (err) {
    p.cancel(`Error: ${err.message}`)
    process.exit(1)
  }

  if (!yes) {
    const confirm = await p.confirm({ message: `Uninstall plugin "${pluginKey}"?` })
    if (p.isCancel(confirm) || !confirm) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
  }

  try {
    await uninstallPlugin(pluginKey, projectRoot)
    p.outro(`Uninstalled ${pluginKey}`)
  } catch (err) {
    p.cancel(`Failed: ${err.message}`)
    process.exit(1)
  }
}
