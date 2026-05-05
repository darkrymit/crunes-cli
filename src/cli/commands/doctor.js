import { spawnSync } from 'node:child_process'
import { loadConfig } from '../../core/config.js'
import { output } from '../../shared/output.js'

const KNOWN_FORMATS = new Set(['1'])

export async function handler({ projectRoot = process.cwd() } = {}) {
  let anyFailed = false

  const major = parseInt(process.versions.node.split('.')[0], 10)
  if (major >= 20) {
    output.success(`Node.js v${process.versions.node}`)
  } else {
    output.error(`Node.js v${process.versions.node} — requires >= 20`)
    anyFailed = true
  }

  const versionResult = spawnSync('crunes', ['--version'], { encoding: 'utf8', shell: true })
  if (versionResult.status === 0) {
    output.success(`crunes ${versionResult.stdout.trim()} in PATH`)
  } else {
    output.error('crunes not found in PATH — is it installed globally?')
    anyFailed = true
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

  if (anyFailed) {
    process.exit(1)
  }
}
