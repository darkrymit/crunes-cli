import { join, relative } from 'node:path'
import { loadConfig } from '../../core/config.js'
import { getRune, resolvePluginRune, resolveRuneFromPlugins } from '../../rune/resolver.js'
import { getArgsSchema, getReplSchema, getPluginRunePath } from '../../rune/isolation/runner.js'
import { loadPluginJson } from '../../plugin/manifest.js'
import { computeEffectivePermissions } from '../../rune/permissions/permissions.js'
import { output } from '../../shared/output.js'
import { enumerateRunes } from '../../rune/enumerate.js'
import { formatRuneIndex, formatCommandPage, formatGlobalIndex, selectNode, flattenCommands } from '../help-render.js'

const SUGGESTIONS = {
  run: 'crunes docs run',
  args: 'crunes docs args',
  intro: 'crunes docs intro',
  utils: 'crunes docs utils',
  globals: 'crunes docs globals',
}

/** Resolve a rune key to everything the docs pages need. Returns null when unknown. */
export async function resolveRuneDocs(config, key, projectRoot, configRoot) {
  const pluginMatch = await resolvePluginRune(config, key)
  const localEntry = pluginMatch ? null : getRune(config, key)

  let autoMatch = null
  if (!pluginMatch && !localEntry) {
    autoMatch = await resolveRuneFromPlugins(config, key)
  }
  const resolved = pluginMatch ?? autoMatch
  if (!localEntry && !resolved) return null

  let runeFile, relativePath, basePerms, vars, displayName, displayDescription, batch

  if (resolved) {
    const { runeKey, pluginDir } = resolved
    const pluginJson = await loadPluginJson(pluginDir)
    const runeDef = pluginJson.runes[runeKey] ?? {}
    runeFile = getPluginRunePath(pluginDir, runeKey, pluginJson)
    relativePath = undefined
    basePerms = runeDef.permissions ?? { allow: [], deny: [] }
    vars = runeDef.vars ?? {}
    displayName = runeDef.name ?? runeKey
    displayDescription = runeDef.description ?? null
    batch = runeDef.batch != null ? { allow: runeDef.batch.allow ?? [], deny: runeDef.batch.deny ?? [] } : null
  } else {
    runeFile = join(configRoot, localEntry.path ?? `.crunes/runes/${key}.js`)
    relativePath = relative(projectRoot, runeFile).replace(/\\/g, '/')
    basePerms = localEntry.permissions ?? { allow: [], deny: [] }
    vars = localEntry.vars ?? {}
    displayName = localEntry.name ?? key
    displayDescription = localEntry.description ?? null
    batch = localEntry.batch != null ? { allow: localEntry.batch.allow ?? [], deny: localEntry.batch.deny ?? [] } : null
  }

  const runEffective = computeEffectivePermissions(basePerms, undefined, 'run')
  const replEffective = computeEffectivePermissions(basePerms, undefined, 'repl')

  let schema = null
  let schemaError = null
  try {
    schema = await getArgsSchema(runeFile, runEffective, projectRoot, { vars, runeKey: key })
  } catch (err) {
    schemaError = err.message
    output.warn(`Could not load args schema for "${key}": ${err.message}`)
  }

  let repl = null
  try {
    const { argsSchema, commandsSchema } = await getReplSchema(runeFile, replEffective, [], projectRoot, { vars, runeKey: key })
    if (argsSchema !== null || commandsSchema !== null) repl = { argsSchema, commandsSchema }
  } catch (err) {
    output.warn(`Could not load REPL schema for "${key}": ${err.message}`)
  }

  return { key, name: displayName, description: displayDescription, relativePath, schema, schemaError, repl, batch }
}

/** `[{ path, description }]` — the index shape, deliberately without option detail. */
function commandRows(commands) {
  return flattenCommands(commands ?? []).map(r => ({ path: r.path, description: r.description }))
}

function directChildRows(node, path) {
  return (node?.commands ?? []).map(c => ({
    path: path ? `${path} ${c.name}` : c.name,
    description: c.description ?? '',
  }))
}

export async function handler({ key, path = [], format = 'text', projectRoot = process.cwd(), configRoot = projectRoot }) {
  let config
  try {
    config = loadConfig(configRoot)
  } catch (err) {
    output.error(`Config unreadable: ${err.message}`)
    process.exit(1)
    return
  }

  if (key == null) {
    const listed = await enumerateRunes(config)
    const entries = []
    let anyFailed = false

    for (const e of listed) {
      let docsEntry = null
      let error = null
      try {
        docsEntry = await resolveRuneDocs(config, e.key, projectRoot, configRoot)
        if (!docsEntry) error = 'rune could not be resolved'
        else if (docsEntry.schemaError) error = docsEntry.schemaError
      } catch (err) {
        error = err.message
      }
      if (error) {
        anyFailed = true
        entries.push({ ...e, error })
      } else {
        entries.push({ ...e, schema: docsEntry.schema })
      }
    }

    if (format === 'json') {
      process.stdout.write(JSON.stringify(entries.map(e => ({
        key: e.key,
        name: e.name,
        description: e.description,
        source: e.source,
        error: e.error ?? null,
        commands: e.error ? [] : commandRows(e.schema?.commands),
      })), null, 2) + '\n')
    } else {
      process.stdout.write(formatGlobalIndex(entries) + '\n')
    }

    if (anyFailed) process.exit(1)
    return
  }

  let docs
  try {
    docs = await resolveRuneDocs(config, key, projectRoot, configRoot)
  } catch (err) {
    output.warn(err.message)
    process.exit(1)
    return
  }

  if (!docs) {
    if (SUGGESTIONS[key]) {
      output.warn(`Unknown rune: "${key}". (Tip: Did you mean "${SUGGESTIONS[key]}"?)`)
    } else {
      output.warn(`Unknown rune: "${key}"`)
    }
    process.exit(1)
    return
  }

  const segments = path ?? []

  if (segments.length === 0) {
    if (format === 'json') {
      process.stdout.write(JSON.stringify({
        key: docs.key,
        name: docs.name,
        description: docs.description,
        relativePath: docs.relativePath,
        options: docs.schema?.options ?? [],
        positionals: docs.schema?.positionals ?? [],
        commands: commandRows(docs.schema?.commands),
        repl: docs.repl ? { commands: docs.repl.commandsSchema?.commands ?? [] } : null,
        batch: docs.batch,
      }, null, 2) + '\n')
    } else {
      process.stdout.write(formatRuneIndex(docs.schema, {
        key: docs.key,
        name: docs.name,
        description: docs.description,
        relativePath: docs.relativePath,
        repl: docs.repl ? { commands: docs.repl.commandsSchema?.commands ?? [] } : null,
        batch: docs.batch,
        includeBatch: true,
      }) + '\n')
    }
    return
  }

  const sel = selectNode(docs.schema, segments)
  if (!sel.node) {
    const lines = [`"${sel.failedAt}" is not a command of rune "${docs.key}"${sel.matchedPath ? ` at path "${sel.matchedPath}"` : ''}.`]
    lines.push('')
    lines.push(`  Available commands: ${sel.candidates.length ? sel.candidates.join(', ') : '(none)'}`)

    const isKnownRune = await resolveRuneDocs(config, sel.failedAt, projectRoot, configRoot).catch(() => null)
    if (isKnownRune) {
      lines.push('')
      lines.push(`  "${sel.failedAt}" is a known rune. Multi-rune lookup was removed — run`)
      lines.push('  `crunes docs rune` for an index of all runes, or `crunes docs rune ' + sel.failedAt + '`.')
    }
    output.error(lines.join('\n'))
    process.exit(1)
    return
  }

  if (format === 'json') {
    process.stdout.write(JSON.stringify({
      path: sel.matchedPath,
      description: sel.node.description ?? null,
      positionals: sel.node.positionals ?? [],
      options: sel.node.options ?? [],
      examples: sel.node.examples ?? [],
      commands: directChildRows(sel.node, sel.matchedPath),
    }, null, 2) + '\n')
  } else {
    process.stdout.write(formatCommandPage(sel.node, { key: docs.key, path: sel.matchedPath }) + '\n')
  }
}
