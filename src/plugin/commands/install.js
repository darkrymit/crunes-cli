import * as p from '@clack/prompts'
import { output } from '../../shared/output.js'
import { resolveFromMarketplace } from '../../marketplace/marketplace.js'
import { installPlugin } from '../install.js'

function parseInstallArg(arg) {
  const idx = arg.indexOf('@')
  if (idx === -1) return null
  return [arg.slice(0, idx), arg.slice(idx + 1)]
}

export async function handler({ source, projectRoot, configRoot, yes, global = false }) {
  const parts = parseInstallArg(source)
  if (!parts) {
    output.cancel('Use <marketplace>@<plugin> format (e.g. hello-world@hello-world)')
    process.exit(1)
  }
  const [marketplaceName, pluginName] = parts

  output.intro('Installing plugin…')

  let resolvedSource, provenance
  try {
    ;({ resolvedSource, ...provenance } = await resolveFromMarketplace(marketplaceName, pluginName))
  } catch (err) {
    output.cancel(err.message)
    process.exit(1)
  }

  let result
  try {
    result = await installPlugin(resolvedSource, configRoot ?? projectRoot, provenance, { yes, global })
  } catch (err) {
    output.cancel(`Installation failed: ${err.message}`)
    process.exit(1)
  }

  if (!result.installed) {
    output.cancel('Installation cancelled.')
    process.exit(0)
  }

  output.outro(`Installed ${result.name}@${result.version}`)
}
