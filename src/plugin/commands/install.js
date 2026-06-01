import * as p from '@clack/prompts'
import { resolveFromMarketplace } from '../../marketplace/marketplace.js'
import { installPlugin } from '../install.js'

function parseInstallArg(arg) {
  const idx = arg.indexOf('@')
  if (idx === -1) return null
  return [arg.slice(0, idx), arg.slice(idx + 1)]
}

export async function handler({ source, projectRoot, yes }) {
  const parts = parseInstallArg(source)
  if (!parts) {
    p.cancel('Use <marketplace>@<plugin> format (e.g. hello-world@hello-world)')
    process.exit(1)
  }
  const [marketplaceName, pluginName] = parts

  p.intro('Installing plugin…')

  let resolvedSource, provenance
  try {
    ;({ resolvedSource, ...provenance } = await resolveFromMarketplace(marketplaceName, pluginName))
  } catch (err) {
    p.cancel(err.message)
    process.exit(1)
  }

  let result
  try {
    result = await installPlugin(resolvedSource, projectRoot, provenance, { yes })
  } catch (err) {
    p.cancel(`Installation failed: ${err.message}`)
    process.exit(1)
  }

  if (!result.installed) {
    p.cancel('Installation cancelled.')
    process.exit(0)
  }

  p.outro(`Installed ${result.name}@${result.version}`)
}
