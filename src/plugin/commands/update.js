import * as p from '@clack/prompts'
import { loadRegistry, resolvePluginKey } from '../registry.js'
import { resolveFromMarketplace } from '../../marketplace/marketplace.js'
import { installPlugin } from '../install.js'

export async function handler({ name, projectRoot }) {
  const registry = await loadRegistry()

  let plugins
  if (name) {
    const pluginKey = resolvePluginKey(name, registry)
    if (!pluginKey) {
      p.cancel(`Plugin "${name}" is not installed. Run: crunes plugin list`)
      process.exit(1)
    }
    plugins = [pluginKey]
  } else {
    plugins = Object.keys(registry.plugins ?? {})
  }

  if (plugins.length === 0) {
    console.log('No plugins installed.')
    return
  }

  p.intro(name ? `Updating ${name}…` : 'Updating all plugins…')

  for (const pluginName of plugins) {
    const entry = registry.plugins[pluginName]
    if (!entry) {
      p.log.warn(`Plugin "${pluginName}" is not installed.`)
      continue
    }

    const atIdx = pluginName.indexOf('@')
    if (atIdx === -1) {
      p.log.warn(`Skipping ${pluginName}: no marketplace provenance (legacy entry).`)
      continue
    }
    const marketplaceName = pluginName.slice(0, atIdx)
    const pluginNamePart  = pluginName.slice(atIdx + 1)

    let resolvedSource, provenance
    try {
      ;({ resolvedSource, ...provenance } = await resolveFromMarketplace(marketplaceName, pluginNamePart))
    } catch (err) {
      p.log.error(`Failed to resolve ${pluginName} from marketplace: ${err.message}`)
      continue
    }

    try {
      const result = await installPlugin(resolvedSource, projectRoot, provenance)
      if (result.installed) {
        p.log.success(`Updated ${pluginName}@${result.version}`)
      } else {
        p.log.warn(`Update of ${pluginName} cancelled (permission consent declined).`)
      }
    } catch (err) {
      p.log.error(`Failed to update ${pluginName}: ${err.message}`)
    }
  }

  p.outro('Done.')
}
