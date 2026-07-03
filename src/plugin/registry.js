import fs from 'node:fs/promises'
import path from 'node:path'
import { getPluginsJsonPath } from '../store/index.js'

const EMPTY_REGISTRY = { format: '1', plugins: {} }

export async function loadRegistry() {
  try {
    const raw = await fs.readFile(getPluginsJsonPath(), 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return structuredClone(EMPTY_REGISTRY)
    throw err
  }
}

export async function saveRegistry(data) {
  const jsonPath = getPluginsJsonPath()
  const tmp = jsonPath + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, jsonPath)
}

export async function registerPlugin(entry) {
  const registry = await loadRegistry()
  const key = `${entry.marketplaceName}@${entry.name}`
  registry.plugins[key] = {
    version:              entry.version,
    path:                 entry.path,
    cacheDir:             entry.cacheDir ?? entry.path,
    local:                entry.local ?? false,
    installedAt:          new Date().toISOString(),
    consentedPermissions: entry.consentedPermissions ?? {},
  }
  await saveRegistry(registry)
}

export async function removePlugin(key) {
  const registry = await loadRegistry()
  delete registry.plugins[key]
  await saveRegistry(registry)
}

/**
 * Resolves a bare plugin name or fully-qualified "marketplace@plugin" key.
 * Returns the full key, or null if not found.
 * Throws if the name is ambiguous (matches multiple installed plugins).
 */
export function resolvePluginKey(nameOrKey, registry) {
  if (nameOrKey.includes('@')) return nameOrKey
  const matches = Object.keys(registry.plugins ?? {})
    .filter(k => k.slice(k.indexOf('@') + 1) === nameOrKey)
  if (matches.length > 1)
    throw new Error(`Ambiguous plugin "${nameOrKey}". Use the full key: ${matches.join(', ')}`)
  return matches[0] ?? null
}

/**
 * Resolves a bare plugin name scoped to the project's enabled plugins first.
 * A fully-qualified "marketplace@plugin" key is returned unchanged.
 * Throws if 2+ enabled plugins share the bare name, or if the name isn't
 * enabled in this project but exists globally (names the real candidates).
 * Returns null if the name doesn't exist anywhere.
 */
export function resolvePluginKeyScoped(nameOrKey, registry, enabledPlugins) {
  if (nameOrKey.includes('@')) return nameOrKey

  const allMatches = Object.keys(registry.plugins ?? {})
    .filter(k => k.slice(k.indexOf('@') + 1) === nameOrKey)
  const scopedMatches = allMatches.filter(k => enabledPlugins.includes(k))

  if (scopedMatches.length === 1) return scopedMatches[0]

  if (scopedMatches.length > 1) {
    throw new Error(`Ambiguous plugin "${nameOrKey}". Use the full key: ${scopedMatches.join(', ')}`)
  }

  if (allMatches.length === 0) return null

  throw new Error(
    `Plugin "${nameOrKey}" is not enabled in this project (installed as ${allMatches.join(', ')}). ` +
    `Run: crunes plugin enable ${allMatches.length === 1 ? allMatches[0] : '<one of the above>'}`
  )
}

