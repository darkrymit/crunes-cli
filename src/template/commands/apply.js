import fs from 'node:fs/promises'
import path from 'node:path'
import { intro, outro, confirm, cancel } from '@clack/prompts'
import { loadConfig } from '../../core/config.js'
import { loadRegistry, resolvePluginKey } from '../../plugin/registry.js'
import { loadPluginJson } from '../../plugin/manifest.js'
import { output } from '../../shared/output.js'

/**
 * Resolve a template given an optional source name and template name.
 * Returns { type: 'local'|'shortcut'|'plugin', templateName, entry, pluginEntry?, pluginJson?, templateMeta? }
 */
export async function resolveTemplate(sourceName, templateName, projectRoot) {
  // Check project/shortcut templates first (unless an explicit plugin source is given)
  if (!sourceName || sourceName === 'project') {
    let config = { templates: {} }
    try { config = loadConfig(projectRoot) } catch {}
    const templates = config.templates ?? {}
    const entry = templates[templateName]
    if (entry !== undefined) {
      if (typeof entry === 'string' || entry.path) {
        return { type: 'local', templateName, entry }
      }
      if (entry.plugin) {
        return { type: 'shortcut', templateName, entry }
      }
      return { type: 'local', templateName, entry: { ...entry, path: `.crunes/templates/${templateName}.js` } }
    }
    if (sourceName === 'project') return null
  }

  // Check plugin templates
  const registry = await loadRegistry()
  const matches = []
  for (const [pluginKey, pluginEntry] of Object.entries(registry.plugins ?? {})) {
    const pluginName = pluginKey.slice(pluginKey.indexOf('@') + 1)
    // sourceName can be bare name or full marketplace@plugin key
    if (sourceName && sourceName !== pluginName && sourceName !== pluginKey) continue
    if (!pluginEntry.path) continue
    let pluginJson
    try { pluginJson = await loadPluginJson(pluginEntry.path) } catch { continue }
    const templateMeta = (pluginJson.templates ?? {})[templateName]
    if (templateMeta) {
      matches.push({ pluginName, pluginEntry, pluginJson, templateMeta })
    }
  }

  if (matches.length > 1) {
    const sources = matches.map(m => m.pluginName).join(', ')
    output.error(`"${templateName}" matches templates in multiple sources: ${sources}. Use source:${templateName}.`)
    process.exit(1)
  }
  if (matches.length === 1) {
    return { type: 'plugin', templateName, ...matches[0] }
  }

  return null
}

export async function handler({
  ref,
  key,
  path: runeRelPath,
  name,
  description,
  yes = false,
  projectRoot = process.cwd(),
  configRoot,
} = {}) {
  const isNonInteractive = yes || !process.stdout.isTTY

  // Parse [source:]template from ref
  let sourceName = null
  let templateName = ref
  if (ref && ref.includes(':')) {
    const colonIdx = ref.indexOf(':')
    sourceName = ref.slice(0, colonIdx)
    templateName = ref.slice(colonIdx + 1)
  }

  const resolved = await resolveTemplate(sourceName, templateName, configRoot ?? projectRoot)

  if (!resolved) {
    output.error(`Template "${templateName}" not found. Run: crunes template list`)
    process.exit(1)
  }

  const outputKey = key ?? templateName
  runeRelPath = runeRelPath ?? `.crunes/runes/${outputKey}.js`
  const runeAbsPath = path.join(projectRoot, runeRelPath)

  if (!isNonInteractive) intro('crunes template apply')

  // Confirm overwrite if file exists
  try {
    await fs.access(runeAbsPath)
    if (!isNonInteractive) {
      const ok = await confirm({ message: `${runeRelPath} already exists. Overwrite?` })
      if (!ok || ok === Symbol.for('clack:cancel')) { cancel('Cancelled.'); process.exit(0) }
    }
  } catch { /* file doesn't exist */ }

  await fs.mkdir(path.dirname(runeAbsPath), { recursive: true })

  let templateMeta = {}

  if (resolved.type === 'local') {
    const localPath = typeof resolved.entry === 'string' ? resolved.entry : resolved.entry.path
    await fs.copyFile(path.join(projectRoot, localPath), runeAbsPath)
    templateMeta = typeof resolved.entry === 'string' ? {} : resolved.entry

  } else if (resolved.type === 'shortcut') {
    // Resolve to plugin: "pluginBareName:templateKey"
    const pluginRef = resolved.entry.plugin
    const colonIdx = pluginRef.indexOf(':')
    const pluginBareName = pluginRef.slice(0, colonIdx)
    const pluginTemplateKey = pluginRef.slice(colonIdx + 1)
    const registry = await loadRegistry()
    const pluginKey = resolvePluginKey(pluginBareName, registry)
    if (!pluginKey) {
      output.error(`Template shortcut "${templateName}" → "${pluginRef}" is not enabled or installed.`)
      process.exit(1)
    }
    const pluginEntry = registry.plugins[pluginKey]
    let pluginJson
    try { pluginJson = await loadPluginJson(pluginEntry.path) } catch (e) {
      output.error(`Failed to load plugin "${pluginBareName}": ${e.message}`)
      process.exit(1)
    }
    const meta = (pluginJson.templates ?? {})[pluginTemplateKey]
    if (!meta) {
      output.error(`Template shortcut "${templateName}" → "${pluginRef}" not found in plugin.`)
      process.exit(1)
    }
    const templateRelPath = meta?.path ?? `templates/${pluginTemplateKey}.js`
    const srcPath = path.join(pluginEntry.path, templateRelPath)
    await fs.copyFile(srcPath, runeAbsPath)
    templateMeta = { ...meta, ...(resolved.entry.name && { name: resolved.entry.name }), ...(resolved.entry.description && { description: resolved.entry.description }) }

  } else if (resolved.type === 'plugin') {
    const templateRelPath = resolved.templateMeta?.path ?? `templates/${resolved.templateName}.js`
    const srcPath = path.join(resolved.pluginEntry.path, templateRelPath)
    await fs.copyFile(srcPath, runeAbsPath)
    templateMeta = resolved.templateMeta
  }

  // Register rune in config
  const configPath = path.join(configRoot ?? projectRoot, '.crunes', 'config.json')
  let config = { runes: {} }
  try { config = JSON.parse(await fs.readFile(configPath, 'utf8')) } catch {}

  const resolvedName = name ?? templateMeta.name
  const resolvedDesc = description ?? templateMeta.description
  const configEntry = {
    path: runeRelPath,
    ...(resolvedName && { name: resolvedName }),
    ...(resolvedDesc && { description: resolvedDesc }),
    ...(templateMeta.permissions && { permissions: templateMeta.permissions }),
  }
  config.runes = { ...(config.runes ?? {}), [outputKey]: configEntry }

  const tmp = configPath + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8')
  await fs.rename(tmp, configPath)

  if (!isNonInteractive) {
    outro(`Created ${runeRelPath}\nRun: crunes run ${outputKey}`)
  } else {
    output.success(`Created ${runeRelPath}`)
    output.info(`Run: crunes run ${outputKey}`)
  }
}
