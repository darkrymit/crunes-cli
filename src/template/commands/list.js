import Table from 'cli-table3'
import { loadConfig } from '../../core/config.js'
import { loadRegistry } from '../../plugin/registry.js'
import { loadPluginJson } from '../../plugin/manifest.js'
import { output } from '../../shared/output.js'

export async function handler({
  source,
  format = 'md',
  plain = false,
  projectRoot = process.cwd(),
} = {}) {
  const results = []

  // Load project/shortcut templates from config.json
  if (!source || source === 'project') {
    let config = { templates: {} }
    try { config = loadConfig(projectRoot) } catch {}
    const templates = config.templates ?? {}
    for (const [name, entry] of Object.entries(templates)) {
      if (typeof entry === 'string') {
        results.push({ source: 'project', template: name, name, description: '' })
      } else if (entry.path) {
        results.push({ source: 'project', template: name, name: entry.name ?? name, description: entry.description ?? '' })
      } else if (entry.plugin) {
        results.push({ source: 'project', template: name, name: entry.name ?? name, description: entry.description ?? '', plugin: entry.plugin })
      } else {
        results.push({ source: 'project', template: name, name: entry.name ?? name, description: entry.description ?? '' })
      }
    }
  }

  // Load plugin templates
  if (!source || source !== 'project') {
    const registry = await loadRegistry()

    // Validate that specified plugin exists
    if (source && source !== 'project') {
      const found = Object.keys(registry.plugins ?? {}).some(k => k === source || k.slice(k.indexOf('@') + 1) === source)
      if (!found) {
        output.error(`Plugin "${source}" is not installed.`)
        process.exit(1)
      }
    }

    for (const [pluginKey, pluginEntry] of Object.entries(registry.plugins ?? {})) {
      const pluginName = pluginKey.slice(pluginKey.indexOf('@') + 1)
      if (source && source !== pluginName && source !== pluginKey) continue
      if (!pluginEntry.path) continue
      let pluginJson
      try { pluginJson = await loadPluginJson(pluginEntry.path) } catch { continue }
      const templates = pluginJson.templates ?? {}
      for (const [name, meta] of Object.entries(templates)) {
        results.push({ source: pluginName, template: name, name: meta.name ?? name, description: meta.description ?? '' })
      }
    }
  }

  if (results.length === 0) {
    output.info('No templates found. Add local ones with: crunes template create')
    return
  }

  if (format === 'json') {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n')
    return
  }

  if (plain) {
    for (const { source: src, template, description } of results) {
      process.stdout.write(`${src}\t${template}\t${description}\n`)
    }
    return
  }

  const table = new Table({
    head: ['Source', 'Template', 'Description'],
    style: { head: ['cyan'] },
  })

  for (const { source: src, template, description, plugin } of results) {
    const desc = plugin ? `${description}  [→ ${plugin}]`.trim() : description
    table.push([src, template, desc])
  }

  process.stdout.write(table.toString() + '\n')
}
