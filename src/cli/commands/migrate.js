import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, isAbsolute, relative } from 'node:path'
import { migrateEntry } from '../../core/rune-entry.js'
import { defaultRuneFile } from '../../core/config.js'
import { getStorePath } from '../../store/index.js'
import { output } from '../../shared/output.js'

/** Rewrite every v1 entry in one JSON file's `runes`; returns the renames it needs. */
function migrateRunes(runes, base, defaultFileFor) {
  const changed = []
  const renames = []
  for (const [key, entry] of Object.entries(runes ?? {})) {
    const rewritten = migrateEntry(entry, { base, defaultFile: defaultFileFor(key) })
    if (!rewritten) continue
    runes[key] = rewritten.entry
    changed.push(key)
    renames.push(...rewritten.renames.map(r => ({
      from: isAbsolute(r.from) ? r.from : join(base, r.from),
      to: isAbsolute(r.to) ? r.to : join(base, r.to),
    })))
  }
  return { changed, renames }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/**
 * The files a migration touches, each with its rewrite. Nothing is written here, so a dry run
 * and a real one compute the same plan; every layer is planned before any module is renamed,
 * because a layer's pathless entries are recognised by the v1 file still being in place.
 */
export function planMigration({ configRoot, global = false }) {
  const files = []
  const layers = global
    ? [{ file: join(getStorePath(), 'config.json'), base: getStorePath(), layer: 'global' }]
    : [
        { file: join(configRoot, '.crunes', 'config.json'), base: configRoot, layer: 'project' },
        { file: join(configRoot, '.crunes', 'config.local.json'), base: configRoot, layer: 'local' },
      ]
  // A local entry for a key the project layer declares only overrides it, and names no file.
  const declared = new Set()
  for (const { file, base, layer } of layers) {
    if (!existsSync(file)) continue
    const json = readJson(file)
    const { changed, renames } = migrateRunes(json.runes, base, key => declared.has(key) ? null : defaultRuneFile(key, layer))
    for (const key of Object.keys(json.runes ?? {})) declared.add(key)
    if (changed.length) files.push({ file, json, changed, renames })
  }
  return files
}

export async function handler({ configRoot, global = false, dryRun = false }) {
  const plan = planMigration({ configRoot, global })
  const shown = file => relative(process.cwd(), file).replace(/\\/g, '/') || file

  if (plan.length === 0) {
    output.success('Nothing to migrate — every entry already uses run and repl blocks.')
    return
  }

  const renames = new Map()
  for (const { file, json, changed, renames: needed } of plan) {
    output.info(`${shown(file)}: ${changed.length} entr${changed.length === 1 ? 'y' : 'ies'} rewritten (${changed.join(', ')})`)
    if (dryRun) output.info(JSON.stringify({ runes: Object.fromEntries(changed.map(k => [k, json.runes[k]])) }, null, 2))
    for (const r of needed) renames.set(r.from, r.to)
  }
  for (const [from, to] of renames) {
    const state = !existsSync(from) ? ' (not found — skipped)' : existsSync(to) ? ' (target exists — skipped)' : ''
    output.info(`rename ${shown(from)} → ${shown(to)}${state}`)
  }
  if (dryRun) return

  for (const { file, json } of plan) writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
  for (const [from, to] of renames) {
    if (existsSync(from) && !existsSync(to)) renameSync(from, to)
  }
  output.success('Migrated. Rename the modules in version control too if it does not track renames.')
}
