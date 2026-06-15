import fs from 'node:fs/promises'
import path from 'node:path'
import { loadRegistry, resolvePluginKey } from '../registry.js'

export async function handler({ name, projectRoot, configRoot }) {
  try {
    const registry = await loadRegistry()
    const pluginKey = resolvePluginKey(name, registry)
    if (!pluginKey) throw new Error(`Plugin "${name}" is not installed. Run: crunes plugin list`)
    await setProjectPluginEnabled(configRoot ?? projectRoot, pluginKey, false)
    console.log(`Plugin "${pluginKey}" disabled.`)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
}

async function setProjectPluginEnabled(configRoot, pluginKey, enabled) {
  const configPath = path.join(configRoot, '.crunes', 'config.json')
  let config
  try {
    config = JSON.parse(await fs.readFile(configPath, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('No .crunes/config.json found. Run: crunes init')
    throw err
  }
  const plugins = config.plugins ?? []
  if (enabled && !plugins.includes(pluginKey)) {
    config.plugins = [...plugins, pluginKey]
  } else if (!enabled) {
    config.plugins = plugins.filter(p => p !== pluginKey)
  }
  const tmp = configPath + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(config, null, 2), 'utf8')
  await fs.rename(tmp, configPath)
}
