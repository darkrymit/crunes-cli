import { loadRegistry } from '../registry.js'

export async function handler({ format = 'md' }) {
  const registry = await loadRegistry()
  const plugins = Object.entries(registry.plugins ?? {})

  if (plugins.length === 0) {
    console.log('No plugins installed.')
    return
  }

  if (format === 'json') {
    console.log(JSON.stringify(registry.plugins, null, 2))
    return
  }

  for (const [key, entry] of plugins) {
    console.log(`${key}  v${entry.version}`)
  }
}
