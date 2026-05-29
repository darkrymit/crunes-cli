import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function validateConfig(config) {
  if (config.permissions && typeof config.permissions === 'object') {
    for (const [runeKey, perms] of Object.entries(config.permissions)) {
      if (perms && typeof perms === 'object') {
        if (Array.isArray(perms.allow) || Array.isArray(perms.deny)) {
          throw new Error(`config.json: permissions for "${runeKey}" must be lifecycle-scoped (e.g. permissions["${runeKey}"].use.allow)`)
        }
      }
    }
  }
}

export function loadConfig(dir) {
  const configPath = join(dir, '.crunes', 'config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  validateConfig(config)
  return config
}
