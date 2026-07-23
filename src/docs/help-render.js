// Pure renderer shared by the host CLI (`crunes docs rune`) and the sandbox
// (`utils.rune.helpText` / `utils.rune.helpSection`).
//
// THIS FILE MUST DECLARE ZERO IMPORTS.
// utils-bootstrap.js imports it and is esbuild-bundled into the V8 isolate on
// both the build path (build.mjs) and the dev/test path (embedded.js). Any
// import here is pulled into the sandbox bundle with all of its transitive
// dependencies.

/** Width of the label column in every page type. */
export const PAD = 24

/** `  label<padding> description`, right-trimmed. */
export function row(label, description, indent = '  ') {
  const padded = label.length >= PAD ? label + ' ' : label.padEnd(PAD)
  return `${indent}${padded} ${description ?? ''}`.trimEnd()
}

/** Positional specs of a single node, space-joined. Empty string when none. */
export function positionalSpecs(node) {
  return (node?.positionals ?? []).map(p => p.spec).join(' ')
}

/**
 * Depth-first flatten of a command tree into full-path rows.
 * `path` is names only; `label` appends the node's own positional specs.
 */
export function flattenCommands(commands, prefix = '') {
  const rows = []
  for (const cmd of commands ?? []) {
    const path = prefix ? `${prefix} ${cmd.name}` : cmd.name
    const specs = positionalSpecs(cmd)
    rows.push({
      path,
      label: specs ? `${path} ${specs}` : path,
      description: cmd.description ?? '',
      node: cmd,
    })
    rows.push(...flattenCommands(cmd.commands ?? [], path))
  }
  return rows
}

/**
 * Walk `schema.commands` by name. On success `node` is the resolved node and
 * `candidates` are its children. On failure `node` is null, `failedAt` is the
 * offending segment, `matchedPath` is the deepest path that did resolve, and
 * `candidates` are the names that were valid there.
 */
export function selectNode(schema, segments) {
  let node = schema
  const matched = []
  for (const seg of segments ?? []) {
    const children = node?.commands ?? []
    const next = children.find(c => c.name === seg)
    if (!next) {
      return {
        node: null,
        matchedPath: matched.join(' '),
        failedAt: seg,
        candidates: children.map(c => c.name),
      }
    }
    node = next
    matched.push(seg)
  }
  return {
    node,
    matchedPath: matched.join(' '),
    failedAt: null,
    candidates: (node?.commands ?? []).map(c => c.name),
  }
}

/** Normalise a path argument (string, array, or nullish) into segments. */
export function toSegments(path) {
  if (Array.isArray(path)) return path.filter(Boolean).map(String)
  return String(path ?? '').trim().split(/\s+/).filter(Boolean)
}

function verb(lifecycle) {
  return lifecycle === 'repl' ? 'repl' : 'run'
}

function optionRows(options, indent = '  ') {
  return (options ?? []).map(opt => {
    const def = opt.def !== undefined ? `  [default: ${JSON.stringify(opt.def)}]` : ''
    return row(opt.flags, `${opt.description ?? ''}${def}`, indent)
  })
}

function exampleLines(examples, indent = '  ') {
  const lines = []
  for (const ex of examples ?? []) {
    lines.push(`${indent}${ex.usage}`)
    if (ex.description) lines.push(`${indent}  ${ex.description}`)
  }
  return lines
}

/**
 * Bounded page for one command. Lists direct children only — this is what keeps
 * every page a fixed size regardless of how deep the tree goes.
 */
export function formatCommandPage(node, meta) {
  const key = meta?.key ?? 'rune'
  const path = meta?.path ?? ''
  const specs = positionalSpecs(node)
  const children = node?.commands ?? []

  const usage = [`Usage: crunes ${verb(meta?.lifecycle)} ${key}`]
  if (path) usage.push(path)
  if (specs) usage.push(specs)
  else if (children.length > 0) usage.push('<command>')
  usage.push('[options]')

  const lines = [usage.join(' ')]

  if (node?.description) {
    lines.push('')
    lines.push(`  ${node.description}`)
  }

  const positionals = node?.positionals ?? []
  if (positionals.length > 0) {
    lines.push('')
    lines.push('Positionals:')
    for (const p of positionals) lines.push(row(p.spec ?? '', p.description))
  }

  const options = node?.options ?? []
  if (options.length > 0) {
    lines.push('')
    lines.push('Options:')
    lines.push(...optionRows(options))
  }

  if (children.length > 0) {
    lines.push('')
    lines.push('Commands:')
    for (const child of children) {
      const childPath = path ? `${path} ${child.name}` : child.name
      const childSpecs = positionalSpecs(child)
      lines.push(row(childSpecs ? `${childPath} ${childSpecs}` : childPath, child.description))
    }
  }

  const examples = node?.examples ?? []
  if (examples.length > 0) {
    lines.push('')
    lines.push('Examples:')
    lines.push(...exampleLines(examples))
  }

  return lines.join('\n')
}

/**
 * Index page for one rune: the full command tree as names-only full paths,
 * plus rune-level options/positionals, REPL commands, and (host only) batch.
 */
export function formatRuneIndex(schema, meta) {
  const key = meta?.key ?? 'rune'
  const label = meta?.description ?? meta?.name ?? null
  const commands = schema?.commands ?? []
  const specs = positionalSpecs(schema)

  const lines = [`Rune: ${key}${label ? ` — ${label}` : ''}`]
  if (meta?.relativePath) lines.push(`File (project-relative): ${meta.relativePath}`)

  const usage = [`Usage: crunes ${verb(meta?.lifecycle)} ${key}`]
  if (specs) usage.push(specs)
  else if (commands.length > 0) usage.push('<command>')
  usage.push('[options]')
  lines.push('')
  lines.push(usage.join(' '))

  const positionals = schema?.positionals ?? []
  if (positionals.length > 0) {
    lines.push('')
    lines.push('Positionals:')
    for (const p of positionals) lines.push(row(p.spec ?? '', p.description))
  }

  const options = schema?.options ?? []
  if (options.length > 0) {
    lines.push('')
    lines.push('Options:')
    lines.push(...optionRows(options))
  }

  if (commands.length > 0) {
    lines.push('')
    lines.push('Commands:')
    for (const r of flattenCommands(commands)) lines.push(row(r.label, r.description))
  }

  const replCommands = meta?.repl?.commands ?? []
  if (replCommands.length > 0) {
    lines.push('')
    lines.push('REPL commands:')
    for (const c of replCommands) lines.push(row(`/${c.name}`, c.description))
  }

  if (meta?.includeBatch === true) {
    lines.push('')
    lines.push('Batch:')
    if (!meta.batch) {
      lines.push('  (not permitted — no batch block declared)')
    } else {
      const allow = meta.batch.allow ?? []
      const deny = meta.batch.deny ?? []
      lines.push(`  allow: ${allow.length ? allow.join(', ') : '(none)'}`)
      if (deny.length) lines.push(`  deny:  ${deny.join(', ')}`)
    }
  }

  if (commands.length > 0) {
    lines.push('')
    lines.push(`Drill down: crunes docs rune ${key} <command>`)
  }

  return lines.join('\n')
}

/** Width of the "key — description" column in the global index. */
export const GLOBAL_PAD = 50

/**
 * Index of every resolvable rune with its names-only run-command tree.
 * REPL commands and batch blocks are deliberately excluded — including them
 * would reintroduce the flooding this page exists to replace.
 */
export function formatGlobalIndex(entries) {
  if (!entries || entries.length === 0) {
    return 'No runes configured. Run `crunes create <key>` to add one.'
  }

  const lines = ['Runes:', '']

  for (const e of entries) {
    if (e.error) {
      lines.push(`⚠ ${e.key} — could not build args schema: ${e.error}`)
      lines.push('')
      continue
    }
    const label = e.description ?? e.name ?? ''
    const head = `${e.key}${label ? ` — ${label}` : ''}`
    const padded = head.length >= GLOBAL_PAD ? head + ' ' : head.padEnd(GLOBAL_PAD)
    lines.push(`${padded}${e.source ?? ''}`.trimEnd())
    for (const r of flattenCommands(e.schema?.commands ?? [])) {
      lines.push(row(r.label, r.description))
    }
    lines.push('')
  }

  lines.push('Drill down: crunes docs rune <key> [command path...]')
  return lines.join('\n')
}
