import { existsSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { getConfigPath, readRawConfig, writeRawConfig } from '../../core/config-writer.js'
import { getStorePath } from '../../store/index.js'
import { output } from '../../shared/output.js'
import { isPathCommand, runtimeOf } from '../native/runtime.js'

/**
 * Register an existing script or program as a rune: writes a run block and nothing else.
 * No file is created and no grants are declared.
 */
export async function handler({ key, command, argv = [], name, description, configRoot = process.cwd(), global = false }) {
  const configPath = getConfigPath({ configRoot, global })
  const config = readRawConfig(configPath)
  if (!config) {
    output.error(`No config at ${configPath}. Run \`crunes init${global ? ' -g' : ''}\` first.`)
    process.exit(1)
  }
  if (config.runes?.[key] != null) {
    output.error(`Rune "${key}" already exists in ${configPath}.`)
    process.exit(1)
  }

  if (isPathCommand(command)) {
    const base = global ? getStorePath() : configRoot
    const file = isAbsolute(command) ? command : join(base, command)
    if (!existsSync(file)) {
      output.error(`${command} does not exist (looked for ${file}).`)
      process.exit(1)
    }
  }

  const run = argv.length > 0 ? { command, argv } : command
  config.runes = {
    ...(config.runes ?? {}),
    [key]: {
      ...(name && { name }),
      ...(description && { description }),
      run,
    },
  }
  await writeRawConfig(configPath, config)

  const runtime = runtimeOf(command)
  output.success(`Added "${key}" → ${[command, ...argv].join(' ')} (${runtime === 'isolate' ? 'isolate' : `${runtime}, native`})`)
  output.info(`Run: crunes run ${key}`)
}
