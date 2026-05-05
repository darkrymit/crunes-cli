import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function loadConfig(dir) {
  const configPath = join(dir, '.crunes', 'config.json')
  return JSON.parse(readFileSync(configPath, 'utf8'))
}
