import { spawnSync } from 'node:child_process'
import { loadConfig, coercePlugins } from '../../core/config.js'
import { getConfigPath, readRawConfig } from '../../core/config-writer.js'
import { output } from '../../shared/output.js'
import { describeRunBlock } from '../../rune/native/run-block.js'
import { existsSync } from 'node:fs'
import { loadJsonSchema } from '../../rune/native/schema.js'
import { relative } from 'node:path'
import { resolveInterpreter, assertNotMissedRename, onPath } from '../../rune/native/runtime.js'

/**
 * One line per rune declared with a run block: what runs it, or why it cannot run.
 * Returns { ok, message } so the caller decides how to print and whether it fails doctor.
 */
export function checkRunBlockRunes(config, projectRoot) {
  const results = []
  for (const [key, entry] of Object.entries(config?.runes ?? {})) {
    if (entry?.run == null) continue
    const desc = describeRunBlock(entry, projectRoot)
    if (desc.runtime === 'isolate') {
      results.push({ ok: true, message: `${key} → isolate` })
      continue
    }
    try {
      if (desc.runtime === 'program') {
        if (!onPath(desc.command)) throw new Error(`"${desc.command}" is not on PATH`)
      } else if (!existsSync(desc.command)) {
        throw new Error(`${relative(projectRoot, desc.command).replace(/\\/g, '/')} does not exist`)
      }
      assertNotMissedRename(desc.command, desc.runtime, projectRoot)
      if (desc.argsModule && /\.json$/i.test(desc.argsModule)) {
        loadJsonSchema(desc.argsModule, relative(projectRoot, desc.argsModule).replace(/\\/g, '/'))
      }
      const found = resolveInterpreter(desc.runtime, projectRoot)
      const how = found ? `${desc.runtime}: ${[found.command, ...found.args].join(' ')}` : desc.runtime === 'program' ? `program: ${onPath(desc.command)}` : `${desc.runtime}: run directly`
      results.push({ ok: true, message: `${key} → ${how} (native)` })
    } catch (err) {
      results.push({ ok: false, message: `${key}: ${err.message}` })
    }
  }
  return results
}

const KNOWN_FORMATS = new Set(['1'])

/**
 * Overlaps between the raw global and project layers. Both kinds of overlap are
 * legitimate, so these are warnings — the point is that merging hides them.
 */
export function collectLayerWarnings({ global = {}, project = {} } = {}) {
  const warnings = []

  for (const key of Object.keys(project.runes ?? {})) {
    if (global.runes?.[key]) {
      warnings.push(`rune "${key}" shadows the global rune of the same name`)
    }
  }

  const globalPlugins = coercePlugins(global.plugins)
  const projectPlugins = coercePlugins(project.plugins)
  for (const [key, enabled] of Object.entries(projectPlugins)) {
    if (globalPlugins[key] === true && enabled === false) {
      warnings.push(`plugin "${key}" is enabled globally but disabled in this project`)
    }
  }

  return warnings
}

export async function handler({ projectRoot = process.cwd() } = {}) {
  let anyFailed = false

  const major = parseInt(process.versions.node.split('.')[0], 10)
  if (major >= 22) {
    output.success(`Node.js v${process.versions.node}`)
  } else {
    output.error(`Node.js v${process.versions.node} — requires >= 22`)
    anyFailed = true
  }

  const versionResult = spawnSync('crunes', ['--version'], { encoding: 'utf8', shell: true })
  if (versionResult.status === 0) {
    output.success(`crunes ${versionResult.stdout.trim()} in PATH`)
  } else {
    output.warn('crunes not found globally in PATH (you can still run it locally or via npx)')
  }

  let config
  try {
    config = loadConfig(projectRoot)
  } catch (err) {
    output.error(`Config: ${err.message}`)
    anyFailed = true
  }

  if (config) {
    const runeCount = Object.keys(config.runes ?? {}).length
    if (config.format !== undefined && !KNOWN_FORMATS.has(String(config.format))) {
      output.error(`Config format "${config.format}" not recognised by this CLI version`)
      anyFailed = true
    } else {
      output.success(`Config valid — ${runeCount} rune${runeCount === 1 ? '' : 's'} registered`)
    }
    for (const { ok, message } of checkRunBlockRunes(config, projectRoot)) {
      if (ok) output.success(message)
      else { output.error(message); anyFailed = true }
    }
  }

  // Read the raw layers, not the merged config — merging is what erases overlap.
  const globalPath = getConfigPath({ global: true })
  let globalRaw = null
  try { globalRaw = readRawConfig(globalPath) } catch { /* reported by loadConfig above */ }

  if (process.env.CRUNES_NO_GLOBAL === '1') {
    output.warn('Global config skipped (CRUNES_NO_GLOBAL=1)')
  } else if (globalRaw) {
    output.success(`Global config found at ${globalPath}`)
  } else {
    output.info(`No global config at ${globalPath}`)
  }

  let projectRaw = null
  try { projectRaw = readRawConfig(getConfigPath({ configRoot: projectRoot })) } catch { /* ditto */ }
  if (!projectRaw) {
    output.info('No project config — crunes runs rootless here, writing no local state')
  }

  for (const warning of collectLayerWarnings({ global: globalRaw ?? {}, project: projectRaw ?? {} })) {
    output.warn(warning)
  }

  if (anyFailed) {
    process.exit(1)
  }
}
