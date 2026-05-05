import fs from 'node:fs/promises'
import path from 'node:path'
import chalk from 'chalk'
import pkg from '../../../package.json' with { type: 'json' }
import { getStorePath } from '../../plugin/store.js'

const PKG_VERSION = pkg.version
const CACHE_PATH = path.join(getStorePath(), 'update-check.json')
const CACHE_TTL_MS = 60 * 60 * 1000
const CHECK_URL = 'https://registry.npmjs.org/@darkrymit/crunes-cli/latest'
const CHECK_TIMEOUT_MS = 2000

/**
 * Read cached latest version if fresh (< 24h). Returns null if stale or missing.
 */
async function readCache() {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8')
    const data = JSON.parse(raw)
    if (data.format !== '1') return null
    const age = Date.now() - new Date(data.checkedAt).getTime()
    if (age > CACHE_TTL_MS) return null
    return data.latestVersion ?? null
  } catch {
    return null
  }
}

/**
 * Fetch latest version from npm and cache it. Returns null on any failure.
 */
async function fetchLatest() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
    let res
    try {
      res = await fetch(CHECK_URL, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) return null
    const json = await res.json()
    const latestVersion = json.version ?? null
    if (!latestVersion) return null

    await fs.mkdir(getStorePath(), { recursive: true })
    await fs.writeFile(CACHE_PATH, JSON.stringify({
      format: '1',
      checkedAt: new Date().toISOString(),
      latestVersion,
    }), 'utf8')

    return latestVersion
  } catch {
    return null
  }
}

/**
 * Returns the latest version string if a newer one is available, otherwise null.
 * Uses cache; falls back to network if stale. Never throws.
 */
async function checkForUpdate() {
  const cached = await readCache()
  const latest = cached ?? await fetchLatest()
  if (!latest) return null
  return latest !== PKG_VERSION ? latest : null
}

export async function handler({ check = true, plain = false } = {}) {
  if (plain) {
    process.stdout.write(`${PKG_VERSION}\n`)
  } else {
    console.log(`crunes ${chalk.bold(PKG_VERSION)}`)
  }

  if (!check) return

  const latest = await checkForUpdate()
  if (!latest) return

  if (plain) {
    process.stdout.write(`update-available ${latest}\n`)
  } else {
    console.log()
    console.log(`  ${chalk.yellow('Update available:')} ${chalk.dim(PKG_VERSION)} → ${chalk.green(latest)}`)
    console.log(`  Run ${chalk.cyan('npm install -g @darkrymit/crunes-cli')} to update.`)
  }
}
