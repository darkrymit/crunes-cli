// A permission denial names the grant it wanted but not where to put it, which leaves
// the reader with an exact string and nowhere to write it. These helpers turn a denial
// message into the config edit that resolves it.

const UNGRANTED = /^'([a-z]+(?:\.[a-z]+)*):([\s\S]*)' is not permitted\.$/
const UNSCANNABLE = /^Cannot scan command: /

/**
 * Returns remediation lines for a permission denial, or null when the message is not one.
 * @param {string} message the error message as thrown
 * @param {{ key: string, lifecycle?: string, configLayers: string }} ctx
 */
export function permissionHint(message, { key, lifecycle = 'run', configLayers }) {
  const text = String(message ?? '').trim()

  // An unscannable command is refused outright; no grant overrides it, so offering
  // one would send the reader to write config that cannot help.
  if (UNSCANNABLE.test(text)) {
    return [
      '',
      '  This construct cannot be split into command positions, so it cannot be permission-checked.',
      '  No grant overrides this — rewrite the command as plain invocations, or move the logic into',
      '  the rune and call the programs directly.',
    ].join('\n')
  }

  const m = UNGRANTED.exec(text)
  if (!m) return null

  const [, capability, value] = m
  const token = `${capability}:${value}`
  const lines = [
    '',
    `  Add the grant to the rune's entry in the config that declares it:`,
    '',
    `    "runes": { "${key}": { "permissions": { "${lifecycle}": { "allow": ["${token}"] } } } }`,
    '',
    `  Looked in: ${configLayers}.`,
  ]

  if (capability === 'shell.run') {
    lines.push(`  Every command in a pipeline needs its own grant — \`crunes shell explain '<command>'\` lists them.`)
  }
  if (capability === 'fs.glob') {
    lines.push(`  fs.glob grants match the pattern string exactly; only \`fs.glob:*\` is a wildcard.`)
  }
  if (lifecycle === 'repl') {
    lines.push(`  "repl" grants are separate from "run" — neither inherits from the other.`)
  }

  return lines.join('\n')
}
