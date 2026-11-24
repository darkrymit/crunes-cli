import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { intro, outro, confirm, cancel } from '@clack/prompts'
import { loadConfig } from '../../core/config.js'
import { loadRegistry, resolvePluginKey } from '../../plugin/registry.js'
import { loadPluginJson } from '../../plugin/manifest.js'
import { scriptLines } from '../../plugin/commands/trust.js'
import { runtimeOf } from '../../rune/native/runtime.js'
import { output } from '../../shared/output.js'

const ENTRY_FILE = /^index(\.rune)?\.[^.]+$/i

/** The `src/index.*` files crunes has a runtime for; a template has exactly one. */
async function findEntries(templateDir) {
  let files
  try { files = await fs.readdir(path.join(templateDir, 'src'), { withFileTypes: true }) } catch { return [] }
  return files
    .filter(f => f.isFile() && ENTRY_FILE.test(f.name) && runtimeOf(`./${f.name}`) !== 'file')
    .map(f => `src/${f.name}`)
}

/** What a script template runs, what the script says, and what else is copied beside it. */
async function describeScript(templateName, templateDir, entry) {
  const files = await fs.readdir(templateDir, { recursive: true, withFileTypes: true })
  const others = files
    .filter(f => !f.isDirectory())
    .map(f => path.relative(templateDir, path.join(f.parentPath, f.name)).replace(/\\/g, '/'))
    .filter(f => f !== entry)
    .sort()
  return [
    `Template "${templateName}" runs natively, outside the sandbox, with your full access`,
    `  command: ${entry}`,
    ...scriptLines(path.join(templateDir, entry)),
    ...(others.length ? ['', `  also copied: ${others.join(', ')}`] : []),
  ].join('\n')
}

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
      if (entry.path) {
        return { type: 'local', templateName, entry }
      }
      if (entry.plugin) {
        return { type: 'shortcut', templateName, entry }
      }
      return { type: 'local', templateName, entry: { ...entry, path: `.crunes/templates/${templateName}` } }
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
      matches.push({ pluginKey, pluginName, pluginEntry, pluginJson, templateMeta })
    }
  }

  if (matches.length > 1) {
    const sources = matches.map(m => m.pluginKey).join(', ')
    const options = matches.map(m => `${m.pluginKey}:${templateName}`).join(' or ')
    output.error(`"${templateName}" matches templates in multiple sources: ${sources}. Use ${options}.`)
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
  path: runePath,
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
  const runeRelDir = (runePath ?? `.crunes/runes/${outputKey}`).replace(/[/\\]+$/, '')
  const runeAbsDir = path.join(projectRoot, runeRelDir)

  if (!isNonInteractive) intro('crunes template apply')

  let templateMeta = {}
  let templateDir

  if (resolved.type === 'local') {
    templateDir = path.resolve(projectRoot, resolved.entry.path)
    templateMeta = resolved.entry

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
    templateDir = path.join(pluginEntry.path, meta.path ?? `templates/${pluginTemplateKey}`)
    templateMeta = { ...meta, ...(resolved.entry.name && { name: resolved.entry.name }), ...(resolved.entry.description && { description: resolved.entry.description }) }

  } else if (resolved.type === 'plugin') {
    templateDir = path.join(resolved.pluginEntry.path, resolved.templateMeta.path ?? `templates/${resolved.templateName}`)
    templateMeta = resolved.templateMeta
  }

  const entries = await findEntries(templateDir)
  if (entries.length !== 1) {
    output.error(`Template "${templateName}" needs exactly one src/index.* entry in ${templateDir} — found ${entries.length ? entries.join(', ') : 'none'}.`)
    process.exit(1)
  }
  const [entry] = entries

  if (runtimeOf(`./${entry}`) !== 'isolate') {
    if (templateMeta.permissions) {
      output.error(`Template "${templateName}" declares permissions, but ${entry} runs natively with full access, so grants would not apply to it.`)
      process.exit(1)
    }
    console.log((await describeScript(templateName, templateDir, entry)) + '\n')
    if (!yes) {
      if (isNonInteractive) {
        output.error('Applying a script template is a decision to make after reading it. Run this in a terminal, or pass -y (crunes -y template apply …) once you have reviewed it.')
        process.exit(1)
      }
      const ok = await confirm({ message: 'Apply this script to run with your full access?' })
      if (ok !== true) { cancel('Cancelled.'); process.exit(0) }
    }
  }

  // Confirm overwrite if the rune folder exists
  if (!isNonInteractive && existsSync(runeAbsDir)) {
    const ok = await confirm({ message: `${runeRelDir} already exists. Overwrite?` })
    if (ok !== true) { cancel('Cancelled.'); process.exit(0) }
  }

  await fs.cp(templateDir, runeAbsDir, { recursive: true })

  // Register rune in config
  const configPath = path.join(configRoot ?? projectRoot, '.crunes', 'config.json')
  let config = { runes: {} }
  try { config = JSON.parse(await fs.readFile(configPath, 'utf8')) } catch {}

  const resolvedName = name ?? templateMeta.name
  const resolvedDesc = description ?? templateMeta.description
  const command = `${runeRelDir}/${entry}`
  const perms = templateMeta.permissions
  const configEntry = {
    ...(resolvedName && { name: resolvedName }),
    ...(resolvedDesc && { description: resolvedDesc }),
    run: perms?.run ? { command, permissions: perms.run } : command,
    ...(perms?.repl && { repl: { command, permissions: perms.repl } }),
  }
  config.runes = { ...(config.runes ?? {}), [outputKey]: configEntry }

  const tmp = configPath + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8')
  await fs.rename(tmp, configPath)

  if (!isNonInteractive) {
    outro(`Created ${runeRelDir}\nRun: crunes run ${outputKey}`)
  } else {
    output.success(`Created ${runeRelDir}`)
    output.info(`Run: crunes run ${outputKey}`)
  }
}
