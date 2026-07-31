import { spawnSync } from 'node:child_process'
import { loadConfig, coercePlugins } from '../../core/config.js'
import { getConfigPath, readRawConfig } from '../../core/config-writer.js'
import { output } from '../../shared/output.js'

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
