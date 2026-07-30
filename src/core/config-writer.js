import fs from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { getStorePath } from '../store/index.js'
import { coercePlugins } from './config.js'

export function getConfigPath({ configRoot, global = false } = {}) {
  if (global) return path.join(getStorePath(), 'config.json')
  return path.join(configRoot, '.crunes', 'config.json')
}

export function readRawConfig(configPath) {
  if (!existsSync(configPath)) return null
  return JSON.parse(readFileSync(configPath, 'utf8'))
}

export async function writeRawConfig(configPath, config) {
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  const tmp = `${configPath}.${Date.now()}${Math.random().toString(36).slice(2)}.tmp`
  await fs.writeFile(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8')
  await fs.rename(tmp, configPath)
}

export async function setPluginEnabled(configPath, pluginKey, enabled) {
  const config = readRawConfig(configPath)
  if (config === null) {
    throw new Error(`No config found at ${configPath}. Run: crunes init (or crunes init -g for the global config)`)
  }
  config.plugins = { ...coercePlugins(config.plugins), [pluginKey]: enabled }
  await writeRawConfig(configPath, config)
}
