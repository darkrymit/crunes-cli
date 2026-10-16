import { existsSync, readFileSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'

const ISOLATE_MODULE = /\.rune\.m?js$/i
const REPL_EXPORT = /\bexport\s+(?:async\s+)?(?:function\s*\*?\s*|const\s+|let\s+|var\s+)repl\b|\bexport\s*\{[^}]*\brepl\b[^}]*\}/

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

function exportsRepl(file) {
  try { return REPL_EXPORT.test(readFileSync(file, 'utf8')) } catch { return false }
}

function block(command, permissions) {
  return permissions ? { ...(command && { command }), permissions } : command
}

/**
 * Rewrite a v1 rune entry — `path`, the fallback file, mode-scoped `permissions`, an implicit
 * REPL — as a v2 entry with run and repl blocks. Returns null when the entry is already v2.
 *
 * base is the directory the entry's paths are relative to; defaultFile is where the v1 fallback
 * looked for a pathless entry. A pathless entry whose fallback file does not exist is a partial
 * override of a rune another layer declares, and keeps no command. `renames` lists the isolate
 * modules that must be renamed to *.rune.js for the rewritten entry to find them.
 */
export function migrateEntry(entry, { base, defaultFile }) {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return null
  const perms = entry.permissions
  const isV1 = entry.path !== undefined || perms !== undefined ||
    (entry.run == null && entry.plugin == null && defaultFile && existsSync(join(base, defaultFile)))
  if (!isV1) return null

  const renames = []
  const file = entry.path ?? (entry.plugin == null && defaultFile && existsSync(join(base, defaultFile)) ? defaultFile : null)
  const blocks = {}

  if (file) {
    const command = isolateName(file)
    if (command !== file) renames.push({ from: file, to: command })
    const absolute = isAbsolute(file) ? file : join(base, file)
    blocks.run = block(command, perms?.run)
    if (perms?.repl || exportsRepl(absolute)) blocks.repl = block(command, perms?.repl)
  } else {
    // A plugin alias or override grants without naming a handler.
    if (perms?.run) blocks.run = { permissions: perms.run }
    if (perms?.repl) blocks.repl = { permissions: perms.repl }
  }

  // The blocks take the place of the first v1 field, so a rewritten file diffs as little as it can.
  const out = {}
  let placed = false
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'path' || key === 'permissions') {
      if (!placed) { Object.assign(out, blocks); placed = true }
      continue
    }
    out[key] = value
  }
  if (!placed) Object.assign(out, blocks)
  return { entry: out, renames }
}

/** The refusal shown for a v1 entry, with the entry rewritten. */
export function v1EntryError(fileName, where, rewritten) {
  return new Error(
    `${fileName}: ${where} uses the old entry shape (path / permissions.run / an implicit REPL), which is no longer read. ` +
    `Rewritten, it is:\n\n${JSON.stringify(rewritten.entry, null, 2).replace(/^/gm, '  ')}\n` +
    (rewritten.renames.length
      ? `\nand the module is renamed: ${rewritten.renames.map(r => `${r.from} → ${r.to}`).join(', ')}\n`
      : '') +
    `\nRun \`crunes migrate\` to rewrite every entry and rename the modules.`
  )
}
