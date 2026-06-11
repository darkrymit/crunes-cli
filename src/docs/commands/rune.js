import { join, relative } from 'node:path'
import { loadConfig } from '../../core/config.js'
import { getRune } from '../../rune/resolver.js'
import { getArgsSchema, getReplSchema } from '../../rune/isolation/runner.js'
import { formatHelp } from '../formatter.js'
import { computeEffectivePermissions } from '../../rune/permissions/permissions.js'
import { output } from '../../shared/output.js'

const SUGGESTIONS = {
  run: 'crunes docs run',
  args: 'crunes docs args',
  intro: 'crunes docs intro',
  utils: 'crunes docs utils',
  globals: 'crunes docs globals',
}

function formatSlashCommands(commands, indent = '') {
  const lines = [`${indent}REPL Slash Commands:`]
  for (const cmd of commands) {
    lines.push(`${indent}  /${cmd.name.padEnd(12)} ${cmd.description ?? ''}`)
    for (const pos of (cmd.positionals ?? [])) {
      lines.push(`${indent}               ${pos.spec.padEnd(14)} ${pos.description ?? ''}`)
    }
    for (const opt of (cmd.options ?? [])) {
      lines.push(`${indent}               ${opt.flags.padEnd(14)} ${opt.description ?? ''}`)
    }
  }
  return lines.join('\n')
}

function formatBatch(batch) {
  const lines = ['Batch:']
  if (!batch) {
    lines.push('  (not permitted — no batch block declared)')
    return lines.join('\n')
  }
  const allow = batch.allow ?? []
  const deny  = batch.deny  ?? []
  lines.push(`  allow: ${allow.length ? allow.join(', ') : '(none)'}`)
  if (deny.length) lines.push(`  deny:  ${deny.join(', ')}`)
  return lines.join('\n')
}

export async function handler({ keys, format = 'text', projectRoot = process.cwd(), configRoot = projectRoot }) {
  let config
  try {
    config = loadConfig(configRoot)
  } catch (err) {
    output.error(`Config unreadable: ${err.message}`)
    process.exit(1)
  }

  const results = []
  let anyFailed = false

  for (const key of keys) {
    const entry = getRune(config, key)
    if (!entry) {
      if (SUGGESTIONS[key]) {
        output.warn(`Unknown rune: "${key}". (Tip: Did you mean "${SUGGESTIONS[key]}"?)`)
      } else {
        output.warn(`Unknown rune: "${key}"`)
      }
      anyFailed = true
      continue
    }

    const runeFile = join(configRoot, entry.path ?? `.crunes/runes/${key}.js`)
    const relativePath = relative(projectRoot, runeFile).replace(/\\/g, '/')
    const basePerms = entry.permissions ?? { allow: [], deny: [] }
    const vars = entry.vars ?? {}

    const runEffective  = computeEffectivePermissions(basePerms, config.permissions?.[key], 'run')
    const replEffective = computeEffectivePermissions(basePerms, config.permissions?.[key], 'runRepl')

    let schema = null
    try {
      schema = await getArgsSchema(runeFile, runEffective, projectRoot, { vars })
    } catch (err) {
      output.warn(`Could not load args schema for "${key}": ${err.message}`)
    }

    let repl = null
    try {
      const { argsSchema, commandsSchema } = await getReplSchema(runeFile, replEffective, [], projectRoot, { vars })
      if (argsSchema !== null || commandsSchema !== null) {
        repl = { argsSchema, commandsSchema }
      }
    } catch (err) {
      output.warn(`Could not load REPL schema for "${key}": ${err.message}`)
    }

    const batch = entry.batch != null
      ? { allow: entry.batch.allow ?? [], deny: entry.batch.deny ?? [] }
      : null

    results.push({
      key,
      name: entry.name ?? key,
      description: entry.description ?? null,
      relativePath,
      schema,
      repl,
      batch,
    })
  }

  if (format === 'json') {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n')
  } else {
    const blocks = []
    for (const r of results) {
      const parts = []
      parts.push(formatHelp(r.schema, { key: r.key, name: r.name, description: r.description, relativePath: r.relativePath }))
      if (r.repl?.argsSchema) {
        parts.push(formatHelp(r.repl.argsSchema, { key: r.key, name: r.name, description: r.description, relativePath: r.relativePath, lifecycle: 'runRepl' }))
      }
      if (r.repl?.commandsSchema?.commands?.length) {
        parts.push(formatSlashCommands(r.repl.commandsSchema.commands))
      }
      parts.push(formatBatch(r.batch))
      blocks.push(parts.join('\n\n'))
    }
    if (blocks.length > 0) process.stdout.write(blocks.join('\n\n') + '\n')
  }

  if (anyFailed) process.exit(1)
}
