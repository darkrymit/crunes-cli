import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item)
}

export function mergeConfigs(shared, local) {
  const merged = { ...shared }

  // 1. Merge Top-level Primitives & simple keys
  for (const [key, value] of Object.entries(local)) {
    if (key !== 'runes' && key !== 'vars' && key !== 'permissions' && key !== 'plugins') {
      merged[key] = value
    }
  }

  // 2. Merge 'runes'
  if (local.runes) {
    merged.runes = { ...shared.runes }
    for (const [key, localEntry] of Object.entries(local.runes)) {
      const sharedEntry = shared.runes?.[key]
      if (sharedEntry && isObject(sharedEntry) && isObject(localEntry)) {
        merged.runes[key] = {
          ...sharedEntry,
          ...localEntry,
          vars: { ...sharedEntry.vars, ...localEntry.vars }
        }
      } else {
        merged.runes[key] = localEntry
      }
    }
  }

  // 3. Merge 'vars'
  if (local.vars) {
    merged.vars = { ...shared.vars }
    for (const [key, localVarsObj] of Object.entries(local.vars)) {
      const sharedVarsObj = shared.vars?.[key]
      if (sharedVarsObj && isObject(sharedVarsObj) && isObject(localVarsObj)) {
        merged.vars[key] = { ...sharedVarsObj, ...localVarsObj }
      } else {
        merged.vars[key] = localVarsObj
      }
    }
  }

  // 4. Merge 'permissions' (Local completely replaces shared per-rune)
  if (local.permissions) {
    merged.permissions = { ...shared.permissions, ...local.permissions }
  }

  // 5. Merge 'plugins' (Union)
  if (local.plugins) {
    const combined = [...(shared.plugins ?? []), ...(local.plugins ?? [])]
    merged.plugins = Array.from(new Set(combined))
  }

  return merged
}

export function validateConfig(config, fileName = 'config.json') {
  if (config.permissions && typeof config.permissions === 'object') {
    for (const [runeKey, perms] of Object.entries(config.permissions)) {
      if (Array.isArray(perms)) {
        throw new Error(`${fileName}: permissions for "${runeKey}" must be lifecycle-scoped (e.g. permissions["${runeKey}"].run.allow)`)
      }
      if (perms && typeof perms === 'object') {
        if (Array.isArray(perms.allow) || Array.isArray(perms.deny)) {
          throw new Error(`${fileName}: permissions for "${runeKey}" must be lifecycle-scoped (e.g. permissions["${runeKey}"].run.allow)`)
        }
      }
    }
  }

  if (config.runes && typeof config.runes === 'object') {
    for (const [runeKey, entry] of Object.entries(config.runes)) {
      if (entry && typeof entry === 'object' && entry.permissions) {
        const perms = entry.permissions
        if (Array.isArray(perms)) {
          throw new Error(`${fileName}: runes["${runeKey}"].permissions must be lifecycle-scoped (e.g. permissions.run.allow)`)
        }
        if (perms && typeof perms === 'object') {
          if (Array.isArray(perms.allow) || Array.isArray(perms.deny)) {
            throw new Error(`${fileName}: runes["${runeKey}"].permissions must be lifecycle-scoped (e.g. permissions.run.allow)`)
          }
          if (perms.run && typeof perms.run === 'object' && Object.keys(perms.run).length === 0) {
            console.warn(`[crunes:warn] ${fileName}: runes["${runeKey}"].permissions.run is empty. No extra permissions will be granted.`)
          }
        }
      }
    }
  }
}

export function loadConfig(dir) {
  const configPath = join(dir, '.crunes', 'config.json')
  const localConfigPath = join(dir, '.crunes', 'config.local.json')

  // Read & validate config.json
  const shared = JSON.parse(readFileSync(configPath, 'utf8'))
  validateConfig(shared, 'config.json')

  // Read & validate config.local.json (if present)
  let local = {}
  if (existsSync(localConfigPath)) {
    try {
      local = JSON.parse(readFileSync(localConfigPath, 'utf8'))
    } catch (err) {
      throw new Error(`config.local.json is invalid JSON: ${err.message}`)
    }
    validateConfig(local, 'config.local.json')
  }

  return mergeConfigs(shared, local)
}
