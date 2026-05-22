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
