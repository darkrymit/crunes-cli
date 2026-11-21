import { join, isAbsolute } from 'node:path'

const ISOLATE_MODULE = /\.rune\.m?js$/i

/** A block written as a string is shorthand for { command }. */
export function blockOf(entry, name) {
  const block = entry?.[name]
  if (block == null) return null
  return typeof block === 'string' ? { command: block } : block
}

/**
 * An entry's block grants in the mode-scoped shape the permission engine and plugin consent
 * read — { run: { allow, deny }, repl: { allow, deny } } — with only the blocks that grant.
 */
export function scopedPermissions(entry) {
  const out = {}
  for (const mode of ['run', 'repl']) {
    const permissions = blockOf(entry, mode)?.permissions
    if (permissions) out[mode] = permissions
  }
  return Object.keys(out).length ? out : undefined
}

/** The isolate module a mode block names, resolved against base, or null. */
export function blockModule(entry, mode, base) {
  const command = blockOf(entry, mode)?.command
  if (!command) return null
  return isAbsolute(command) ? command : join(base, command)
}

/** `x.js` → `x.rune.js`, `x.mjs` → `x.rune.mjs`; a name that already says isolate is kept. */
export function isolateName(file) {
  if (ISOLATE_MODULE.test(file)) return file
  return file.replace(/\.(m?js)$/i, '.rune.$1')
}
