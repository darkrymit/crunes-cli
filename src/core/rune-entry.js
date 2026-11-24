import { join, isAbsolute } from 'node:path'

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
