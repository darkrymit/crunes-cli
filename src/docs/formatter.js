function formatCommands(commands, depth = 0) {
  const lines = []
  const indent = '  '.repeat(depth + 1)
  const childIndent = '  '.repeat(depth + 2)
  const detailIndent = '  '.repeat(depth + 3)

  for (const cmd of commands) {
    const posSpecs = (cmd.positionals ?? []).map(p => p.spec).join(' ')
    const cmdStr = `${cmd.name}${posSpecs ? ' ' + posSpecs : ''}`
    lines.push(`${indent}${cmdStr.padEnd(30 - depth * 2)} ${cmd.description ?? ''}`.trimEnd())

    const cmdPos = cmd.positionals ?? []
    if (cmdPos.length > 0) {
      lines.push(`${childIndent}Positionals:`)
      for (const p of cmdPos) {
        lines.push(`${detailIndent}${p.spec.padEnd(26)} ${p.description ?? ''}`.trimEnd())
      }
    }

    const cmdOpts = cmd.options ?? []
    if (cmdOpts.length > 0) {
      lines.push(`${childIndent}Options:`)
      for (const opt of cmdOpts) {
        const defStr = opt.def !== undefined ? `  [default: ${JSON.stringify(opt.def)}]` : ''
        lines.push(`${detailIndent}${opt.flags.padEnd(26)} ${opt.description ?? ''}${defStr}`.trimEnd())
      }
    }

    const cmdExs = cmd.examples ?? []
    if (cmdExs.length > 0) {
      lines.push(`${childIndent}Examples:`)
      for (const ex of cmdExs) {
        lines.push(`${detailIndent}${ex.usage}`)
        if (ex.description) lines.push(`${detailIndent}  ${ex.description}`)
      }
    }

    const nestedCmds = cmd.commands ?? []
    if (nestedCmds.length > 0) {
      lines.push(`${childIndent}Commands:`)
      lines.push(...formatCommands(nestedCmds, depth + 2))
    }
    lines.push('')
  }
  return lines
}

export function formatHelp(schema, runeMeta) {
  const lines = []
  const key  = runeMeta?.key ?? 'rune'
  const desc = runeMeta?.description ?? runeMeta?.name

  if (runeMeta?.relativePath) {
    lines.push(`File (project-relative): ${runeMeta.relativePath}`)
    lines.push('')
  }

  const hasCommands = (schema?.commands ?? []).length > 0
  const cmd = runeMeta?.lifecycle === 'runRepl' ? 'run-repl' : 'run'
  lines.push(`Usage: crunes ${cmd} ${key} ${hasCommands ? '<command> ' : ''}[options]`)
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

  const commands = schema?.commands ?? []
  if (commands.length > 0) {
    lines.push('')
    lines.push('Commands:')
    const cmdLines = formatCommands(commands, 0)
    lines.push(...cmdLines)
    if (lines[lines.length - 1] === '') {
      lines.pop()
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
