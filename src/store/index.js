import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export function getStorePath() {
  return process.env.CRUNES_STORE ?? path.join(os.homedir(), '.crunes')
}

export function getProjectsJsonPath() {
  return path.join(getStorePath(), 'projects.json')
}

export function getPluginsJsonPath() {
  return path.join(getStorePath(), 'plugins.json')
}

export function getPluginCacheDir(name, version, marketplace = '_local') {
  return path.join(getStorePath(), 'plugins', marketplace, name, version)
}

export function getPnpmStorePath() {
  return path.join(getStorePath(), 'store')
}

export function getMarketplacesJsonPath() {
  return path.join(getStorePath(), 'marketplaces.json')
}

export function getMarketplaceCacheDir(name) {
  return path.join(getStorePath(), 'marketplaces', name)
}

export function getCachesBasePath() { return path.join(getStorePath(), 'caches') }
export function getSqliteBasePath() { return path.join(getStorePath(), 'sqlite') }
export function getCacheJsonPath()  { return path.join(getStorePath(), 'cache.json') }
export function getSqliteJsonPath() { return path.join(getStorePath(), 'sqlite.json') }

export async function ensureStoreDirs() {
  const base = getStorePath()
  await fs.mkdir(path.join(base, 'plugins'), { recursive: true })
  await fs.mkdir(path.join(base, 'marketplaces'), { recursive: true })
  await fs.mkdir(getPnpmStorePath(), { recursive: true })
}
