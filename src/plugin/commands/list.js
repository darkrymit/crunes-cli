import { loadRegistry } from '../registry.js'
import { loadConfig } from '../../core/config.js'
import { loadPluginJson } from '../manifest.js'
import { isNativeRune } from '../native.js'

export async function handler({ format = 'md', projectRoot = process.cwd() } = {}) {
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

  let enabledKeys = new Set()
  try {
    const config = await loadConfig(projectRoot)
    for (const [k, v] of Object.entries(config.plugins ?? {})) {
      if (v) enabledKeys.add(k)
    }
  } catch {
    // Non-fatal if config fails to load
  }

  for (const [key, entry] of plugins) {
    const isEnabled = enabledKeys.has(key)
    let hasNative = false
    try {
      if (entry.path) {
        const pj = await loadPluginJson(entry.path)
        hasNative = Object.values(pj.runes ?? {}).some(r => isNativeRune(r))
      }
    } catch {
      // ignore
    }
    const tags = []
    if (isEnabled) tags.push('[enabled]')
    if (hasNative) tags.push('(native runes)')
    const tagStr = tags.length ? ` ${tags.join(' ')}` : ''
    console.log(`${key}  v${entry.version}${tagStr}`)
  }
}
