import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

export function getStorePath() {
  return process.env.CRUNES_STORE ?? path.join(os.homedir(), '.crunes')
}

// Duplicated rather than imported from src/project: store is a leaf module.
function shortHash(str) {
  return createHash('sha1').update(str).digest('hex').slice(0, 8)
}

export function isRootless(projectDir) {
  return !existsSync(path.join(projectDir, '.crunes', 'config.json'))
}

export function getRootlessBase(projectDir) {
  return path.join(getStorePath(), 'rootless', shortHash(projectDir))
}

/**
 * Where per-project local state (caches, sqlite, jobs, schemas, node_modules)
 * lives. In a project that is `<project>/.crunes`; with no project config it
 * redirects into the store so the working directory is never written to.
 */
export function getLocalBase(projectDir) {
  return isRootless(projectDir) ? getRootlessBase(projectDir) : path.join(projectDir, '.crunes')
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

export function getCacheBasePath() { return path.join(getStorePath(), 'cache') }
export function getSqliteBasePath() { return path.join(getStorePath(), 'sqlite') }
export function getCacheJsonPath()  { return path.join(getStorePath(), 'cache.json') }
export function getSqliteJsonPath() { return path.join(getStorePath(), 'sqlite.json') }

export async function ensureStoreDirs() {
  const base = getStorePath()
  await fs.mkdir(path.join(base, 'plugins'), { recursive: true })
  await fs.mkdir(path.join(base, 'marketplaces'), { recursive: true })
  await fs.mkdir(getPnpmStorePath(), { recursive: true })
}
