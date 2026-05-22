import yargsParser from 'yargs-parser'

const FLAG_SHORT = /^-([a-zA-Z])$/
const FLAG_LONG  = /^--([a-zA-Z][a-zA-Z0-9-]*)(?:\s+<([a-zA-Z]+)>|\s+\[([a-zA-Z]+)\])?$/

export function parseFlags(flagStr) {
  const parts = flagStr.split(',').map(s => s.trim())
  let short = undefined
  let long  = null
  let type  = 'boolean'

  for (const part of parts) {
    const sm = part.match(FLAG_SHORT)
    if (sm) { short = sm[1]; continue }
    const lm = part.match(FLAG_LONG)
    if (lm) {
      long = lm[1]
      if (lm[2] || lm[3]) {
        const t = (lm[2] || lm[3]).toLowerCase()
        type = t === 'number' ? 'number' : 'string'
      }
    }
  }

  const key = long ?? short
  if (!key) throw new Error(`invalid flag spec "${flagStr}"`)
  return { key, alias: short, type }
}

export function buildYargsConfig(schema) {
  if (!schema) return {}
  const cfg = { alias: {}, boolean: [], number: [], string: [], default: {} }
  for (const opt of schema.options ?? []) {
    const { key, alias, type } = parseFlags(opt.flags)
    if (alias) cfg.alias[alias] = key
    if (type === 'boolean') cfg.boolean.push(key)
    else if (type === 'number') cfg.number.push(key)
    else cfg.string.push(key)
    if (opt.def !== undefined) cfg.default[key] = opt.def
  }
  return cfg
}

export function parseArgs(rawArgs, schema) {
  const cfg = buildYargsConfig(schema)
  const parsed = yargsParser(rawArgs, cfg)
  parsed.$raw = rawArgs
  return parsed
}

export function formatHelp(schema, runeMeta) {
  const lines = []
  const key  = runeMeta?.key ?? 'rune'
  const desc = runeMeta?.description ?? runeMeta?.name

  lines.push(`Usage: crunes use ${key} [options]`)
  if (desc) { lines.push(''); lines.push(`  ${desc}`) }

  const positionals = schema?.positionals ?? []
  if (positionals.length > 0) {
    lines.push('')
    for (const p of positionals) {
      lines.push(`  ${(p.spec ?? '').padEnd(20)} ${p.description ?? ''}`.trimEnd())
    }
  }

  const options = schema?.options ?? []
  if (options.length > 0) {
    lines.push('')
    lines.push('Options:')
    for (const opt of options) {
      const defStr = opt.def !== undefined ? `  [default: ${JSON.stringify(opt.def)}]` : ''
      lines.push(`  ${opt.flags.padEnd(30)} ${opt.description ?? ''}${defStr}`.trimEnd())
    }
  }

  const examples = schema?.examples ?? []
  if (examples.length > 0) {
    lines.push('')
    lines.push('Examples:')
    for (const ex of examples) {
      lines.push(`  ${ex.usage}`)
      if (ex.description) lines.push(`    ${ex.description}`)
    }
  }

  return lines.join('\n')
}
