import * as p from '@clack/prompts'
import { output } from '../../shared/output.js'
import { loadRegistry, resolvePluginKey } from '../registry.js'
import { uninstallPlugin } from '../install.js'

export async function handler({ name, yes, projectRoot, configRoot, global = false }) {
  let pluginKey
  try {
    const registry = await loadRegistry()
    pluginKey = resolvePluginKey(name, registry)
    if (!pluginKey) throw new Error(`Plugin "${name}" is not installed. Run: crunes plugin list`)
  } catch (err) {
    output.cancel(`Error: ${err.message}`)
    process.exit(1)
  }

  if (!yes) {
    const confirm = await p.confirm({ message: `Uninstall plugin "${pluginKey}"?` })
    if (p.isCancel(confirm) || !confirm) {
      output.cancel('Cancelled.')
      process.exit(0)
    }
  }

  try {
    await uninstallPlugin(pluginKey, configRoot ?? projectRoot, { global })
    output.outro(`Uninstalled ${pluginKey}`)
  } catch (err) {
    output.cancel(`Failed: ${err.message}`)
    process.exit(1)
  }
}
