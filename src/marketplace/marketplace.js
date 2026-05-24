import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import { getMarketplacesJsonPath, getMarketplaceCacheDir, ensureStoreDirs } from '../store/index.js'

const execFileAsync = promisify(execFile)

const EMPTY_MARKETPLACES = { format: '1', marketplaces: {} }

// marketplaces.json schema:
// {
//   "format": "1",
//   "marketplaces": {
//     "<name>": { "source": "github:owner/repo" }
//   }
// }

export async function loadMarketplaces() {
  try {
    const raw = await fs.readFile(getMarketplacesJsonPath(), 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return structuredClone(EMPTY_MARKETPLACES)
    throw err
  }
}

async function saveMarketplaces(data) {
  const jsonPath = getMarketplacesJsonPath()
  const tmp = jsonPath + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, jsonPath)
}

function classifyMarketplaceSource(source) {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return { type: 'http', resolved: source }
  }
  if (source.startsWith('github:') || /^[\w-]+\/[\w.-]+$/.test(source)) {
    return { type: 'github', resolved: source.replace(/^github:/, '') }
  }
  if (source.startsWith('npm:')) {
    return { type: 'npm', resolved: source.replace(/^npm:/, '') }
  }
  if (isLocalPath(source)) {
    return { type: 'local', resolved: path.resolve(source) }
  }
  return { type: 'npm', resolved: source }
}

function isLocalPath(source) {
  return source.startsWith('.') || source.startsWith('/') || source.startsWith('~') || /^[A-Za-z]:[/\\]/.test(source)
}

/**
 * Download marketplace.json from a remote source. Does not cache.
 */
async function downloadMarketplaceJson(classified) {
  if (classified.type === 'github') {
    const url = `https://raw.githubusercontent.com/${classified.resolved}/HEAD/.crunes-plugin/marketplace.json`
    const res = await fetch(url, { headers: { 'User-Agent': 'crunes-cli' } })
    if (!res.ok) throw new Error(`Failed to fetch marketplace from GitHub (${classified.resolved}): HTTP ${res.status}`)
    return res.json()
  }

  if (classified.type === 'http') {
    const res = await fetch(classified.resolved, { headers: { 'User-Agent': 'crunes-cli' } })
    if (!res.ok) throw new Error(`Failed to fetch marketplace: HTTP ${res.status}`)
    return res.json()
  }

  if (classified.type === 'npm') {
    const tmp = path.join(os.tmpdir(), `crunes-marketplace-${Date.now()}`)
    await fs.mkdir(tmp, { recursive: true })
    try {
      await execFileAsync('npm', ['pack', classified.resolved, '--pack-destination', tmp], { shell: process.platform === 'win32' })
      const files = await fs.readdir(tmp)
      const tarball = files.find(f => f.endsWith('.tgz'))
      if (!tarball) throw new Error(`npm pack produced no tarball for ${classified.resolved}`)
      const extractDir = path.join(tmp, 'extracted')
      await fs.mkdir(extractDir, { recursive: true })
      await execFileAsync('tar', ['-xzf', path.join(tmp, tarball), '-C', extractDir, '--strip-components=1'], { shell: process.platform === 'win32' })
      const raw = await fs.readFile(path.join(extractDir, '.crunes-plugin', 'marketplace.json'), 'utf8')
      return JSON.parse(raw)
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
    }
  }

  throw new Error(`Unsupported marketplace source type: ${classified.type}`)
}

/**
 * Read marketplace.json for a local source. Returns { data, resolutionBase }.
 */
async function readLocalMarketplace(resolvedPath) {
  const stat = await fs.stat(resolvedPath)
  const jsonPath = stat.isDirectory() ? path.join(resolvedPath, '.crunes-plugin', 'marketplace.json') : resolvedPath
  const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'))
  const resolvedDir = path.dirname(jsonPath)
  const resolutionBase = path.basename(resolvedDir) === '.crunes-plugin'
    ? path.dirname(resolvedDir)
    : resolvedDir
  return { data, resolvedPath: resolutionBase }
}

/**
 * Load a marketplace by name from the registry.
 * Returns { data, resolvedPath }.
 */
async function fetchMarketplace(name, entry) {
  const classified = classifyMarketplaceSource(entry.source)

  if (classified.type === 'local') {
    return readLocalMarketplace(classified.resolved)
  }

  if (classified.type === 'http') {
    const res = await fetch(classified.resolved, { headers: { 'User-Agent': 'crunes-cli' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { data: await res.json(), resolvedPath: classified.resolved }
  }

  // github / npm — read from cache keyed by marketplace name
  const cacheDir = getMarketplaceCacheDir(name)
  try {
    const data = JSON.parse(await fs.readFile(path.join(cacheDir, 'marketplace.json'), 'utf8'))
    return { data, resolvedPath: cacheDir }
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`Marketplace "${name}" not cached. Run: crunes marketplace update ${name}`)
    throw err
  }
}

/**
 * Download and persist a remote marketplace to its cache dir.
 * Returns the marketplace name from the downloaded JSON.
 */
async function cacheMarketplace(source, classified) {
  const json = await downloadMarketplaceJson(classified)
  if (!json.name) throw new Error(`marketplace.json from "${source}" is missing a "name" field`)
  const cacheDir = getMarketplaceCacheDir(json.name)
  await fs.mkdir(cacheDir, { recursive: true })
  await fs.writeFile(path.join(cacheDir, 'marketplace.json'), JSON.stringify(json, null, 2), 'utf8')
  return json.name
}

export async function addMarketplace(source) {
  await ensureStoreDirs()
  const normalised = isLocalPath(source) ? path.resolve(source) : source
  const classified = classifyMarketplaceSource(normalised)

  let name

  if (classified.type === 'local') {
    const { data } = await readLocalMarketplace(classified.resolved)
    if (!data.name) throw new Error(`marketplace.json at "${normalised}" is missing a "name" field`)
    name = data.name
  } else {
    name = await cacheMarketplace(normalised, classified)
  }

  const data = await loadMarketplaces()
  if (data.marketplaces[name]) throw new Error(`Marketplace "${name}" is already configured.`)
  data.marketplaces[name] = { source: normalised }
  await saveMarketplaces(data)
  return name
}

export async function removeMarketplace(name) {
  const data = await loadMarketplaces()
  if (!data.marketplaces[name]) throw new Error(`Marketplace "${name}" is not configured.`)
  delete data.marketplaces[name]
  await saveMarketplaces(data)
  await fs.rm(getMarketplaceCacheDir(name), { recursive: true, force: true }).catch(() => {})
}

export async function updateMarketplace(name) {
  const data = await loadMarketplaces()
  if (!data.marketplaces[name]) throw new Error(`Marketplace "${name}" is not configured.`)
  const entry = data.marketplaces[name]
  const classified = classifyMarketplaceSource(entry.source)

  if (classified.type === 'local' || classified.type === 'http') return // always fresh, no cache

  const newName = await cacheMarketplace(entry.source, classified)
  if (newName !== name) {
    // Marketplace was renamed — update registry key
    await fs.rm(getMarketplaceCacheDir(name), { recursive: true, force: true }).catch(() => {})
    delete data.marketplaces[name]
    data.marketplaces[newName] = { source: entry.source }
    await saveMarketplaces(data)
  }
}

export async function listMarketplaces() {
  const data = await loadMarketplaces()
  return Object.entries(data.marketplaces).map(([name, entry]) => ({ name, ...entry }))
}

export async function searchMarketplaces(query) {
  const data = await loadMarketplaces()
  const entries = Object.entries(data.marketplaces)
  if (entries.length === 0) return []

  const results = []
  const lowerQuery = query.toLowerCase()

  await Promise.allSettled(
    entries.map(async ([name, entry]) => {
      try {
        const { data: marketplace } = await fetchMarketplace(name, entry)
        for (const plugin of marketplace.plugins ?? []) {
          const searchable = `${plugin.name} ${plugin.description ?? ''}`.toLowerCase()
          if (searchable.includes(lowerQuery)) {
            results.push({ ...plugin, _marketplace: name })
          }
        }
      } catch (err) {
        console.error(`Warning: could not load marketplace "${name}": ${err.message}`)
      }
    })
  )

  return results
}

export async function resolveFromMarketplace(marketplaceName, pluginName) {
  const data = await loadMarketplaces()
  if (Object.keys(data.marketplaces).length === 0) {
    throw new Error('No marketplaces configured. Run: crunes marketplace add <source>')
  }

  const entry = data.marketplaces[marketplaceName]
  if (!entry) throw new Error(`Marketplace "${marketplaceName}" is not configured. Run: crunes marketplace list`)

  const { data: marketplace, resolvedPath } = await fetchMarketplace(marketplaceName, entry)
  const plugin = (marketplace.plugins ?? []).find(p => p.name === pluginName)
  if (!plugin) {
    throw new Error(`Plugin "${pluginName}" not found in marketplace "${marketplaceName}". Run: crunes marketplace search <query>`)
  }

  const resolvedSource = resolvePluginSource(plugin.source, resolvedPath)
  return {
    resolvedSource,
    marketplaceName,
    pluginName,
    version: plugin.version,
    description: plugin.description,
    author: plugin.author,
    license: plugin.license
  }
}

function resolvePluginSource(source, marketplaceResolvedPath) {
  if (!isLocalPath(source)) return source
  if (marketplaceResolvedPath.startsWith('http://') || marketplaceResolvedPath.startsWith('https://')) {
    return new URL(source, marketplaceResolvedPath).href
  }
  return path.resolve(marketplaceResolvedPath, source)
}
