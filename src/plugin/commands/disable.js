import fs from 'node:fs/promises'
import path from 'node:path'

function resolveEnabledPluginKey(nameOrKey, enabledPlugins) {
  if (nameOrKey.includes('@')) return nameOrKey
  const matches = enabledPlugins.filter(k => k.slice(k.indexOf('@') + 1) === nameOrKey)
  if (matches.length > 1) {
    throw new Error(`Ambiguous plugin "${nameOrKey}". Use the full key: ${matches.join(', ')}`)
  }
  return matches[0] ?? null
}

export async function handler({ name, projectRoot, configRoot }) {
  const configPath = path.join(configRoot ?? projectRoot, '.crunes', 'config.json')

  let config
  try {
    config = JSON.parse(await fs.readFile(configPath, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('Error: No .crunes/config.json found. Run: crunes init')
    } else {
      console.error(`Error: ${err.message}`)
    }
    process.exit(1)
  }

  const enabledPlugins = config.plugins ?? []

  let pluginKey
  try {
    pluginKey = resolveEnabledPluginKey(name, enabledPlugins)
    if (!pluginKey) throw new Error(`Plugin "${name}" is not enabled in this project.`)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }

  config.plugins = enabledPlugins.filter(p => p !== pluginKey)
  const tmp = configPath + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(config, null, 2), 'utf8')
  await fs.rename(tmp, configPath)
  console.log(`Plugin "${pluginKey}" disabled.`)
}
