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
