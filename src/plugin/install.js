import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { extract as tarExtract } from 'tar'
import { loadPluginJson } from './manifest.js'
import { getPluginCacheDir, ensureStoreDirs } from '../store/index.js'
import { registerPlugin, loadRegistry, removePlugin } from './registry.js'
import { installDeps } from './deps.js'
import { promptConsent, diffPermissions, promptReConsent } from './consent.js'
import { getConfigPath, readRawConfig, writeRawConfig, setPluginEnabled } from '../core/config-writer.js'
import { coercePlugins } from '../core/config.js'
import { scopedPermissions } from '../core/rune-entry.js'

const execFileAsync = promisify(execFile)

function collectAllowFromRune(rune) {
  const all = []
  for (const lifecycle of Object.values(scopedPermissions(rune) ?? {})) {
    for (const perm of lifecycle?.allow ?? []) {
      if (!all.includes(perm)) all.push(perm)
    }
  }
  return all
}

/**
 * Resolve a source string to { type, resolved, subpath? }
 *   type: 'local' | 'github' | 'git' | 'npm'
 */
export function classifySource(source) {
  if (source.startsWith('.') || source.startsWith('/') || source.startsWith('~') || /^[A-Za-z]:[/\\]/.test(source)) {
    return { type: 'local', resolved: source.replace(/^~/, os.homedir()) }
  }
  if (source.startsWith('https://') || source.startsWith('git+')) {
    return { type: 'git', resolved: source }
  }
  const [baseSource, subpath] = source.split('#')
  if (/^[\w-]+\/[\w.-]+$/.test(baseSource) || baseSource.startsWith('github:')) {
    const repo = baseSource.replace(/^github:/, '')
    return { type: 'github', resolved: `https://github.com/${repo}`, ...(subpath && { subpath }) }
  }
  return { type: 'npm', resolved: source }
}

async function downloadGitHub(repoUrl, destDir) {
  // Download default branch tarball from GitHub API
  const apiUrl = repoUrl.replace('https://github.com/', 'https://api.github.com/repos/') + '/tarball'
  const res = await fetch(apiUrl, { headers: { 'User-Agent': 'crunes-cli' } })
  if (!res.ok) throw new Error(`Failed to download ${repoUrl}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const tarPath = path.join(destDir, 'plugin.tar.gz')
  await fs.writeFile(tarPath, buf)
  await tarExtract({ file: tarPath, cwd: destDir, strip: 1 })
  await fs.rm(tarPath)
}

async function downloadGit(gitUrl, destDir) {
  await execFileAsync('git', ['clone', '--depth=1', gitUrl, destDir])
}

async function downloadNpm(packageName, destDir) {
  const tmp = destDir + '.tmp-npm'
  await fs.mkdir(tmp, { recursive: true })
  try {
    await execFileAsync('npm', ['pack', packageName, '--pack-destination', tmp], { shell: process.platform === 'win32' })
    const files = await fs.readdir(tmp)
    const tarball = files.find(f => f.endsWith('.tgz'))
    if (!tarball) throw new Error(`npm pack produced no tarball for ${packageName}`)
    await fs.mkdir(destDir, { recursive: true })
    await tarExtract({ file: path.join(tmp, tarball), cwd: destDir, strip: 1 })
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

/**
 * Install a plugin from source into the global store.
 *
 * @param {string} source      - local path, github:owner/repo, git URL, or npm package
 * @param {string} projectDir  - project root (for updating .crunes/config.json)
 * @param {{ marketplaceName?: string, pluginName?: string }} provenance
 */
export async function installPlugin(source, projectDir, provenance = {}, options = {}) {
  const { yes = false, global = false } = options
  if (!provenance.marketplaceName) {
    throw new Error('Direct installs are not allowed. Use: crunes plugin install <marketplace>@<plugin>')
  }
  await ensureStoreDirs()

  const { type, resolved, subpath } = classifySource(source)

  // For local installs, load plugin.json first to get name/version
  let tempRoot = null
  let stagingDir
  if (type === 'local') {
    stagingDir = path.resolve(resolved)
  } else {
    tempRoot = path.join(os.tmpdir(), `crunes-install-${Date.now()}`)
    await fs.mkdir(tempRoot, { recursive: true })
    stagingDir = tempRoot
  }

  try {
    if (type === 'github') {
      await downloadGitHub(resolved, tempRoot)
      if (subpath) stagingDir = path.join(tempRoot, subpath)
    } else if (type === 'git') await downloadGit(resolved, stagingDir)
    else if (type === 'npm') await downloadNpm(resolved, stagingDir)
    // local: stagingDir already points to the plugin

    const pluginJson = await loadPluginJson(stagingDir)
    const name = provenance.pluginName
    const version = provenance.version
    if (!name || !version) {
      throw new Error(`Provenance missing plugin identity: name="${name}", version="${version}"`)
    }
    const pluginKey = `${provenance.marketplaceName}@${name}`

    // Check if already installed — if so, handle as update
    const registry = await loadRegistry()
    const existing = registry.plugins?.[pluginKey]
    if (existing) {
      return await updatePlugin(pluginKey, stagingDir, pluginJson, projectDir, type === 'local', provenance, { yes, global })
    }

    const isLocal = type === 'local'
    const cacheDir = getPluginCacheDir(name, version, provenance.marketplaceName)

    if (!isLocal) {
      await fs.cp(stagingDir, cacheDir, { recursive: true })
    } else {
      await fs.mkdir(cacheDir, { recursive: true })
    }

    // Install declared dependencies
    await installDeps(cacheDir, pluginJson.dependencies)

    // Consent
    const consented = await promptConsent(name, pluginJson, { yes })
    if (!consented) {
      await fs.rm(cacheDir, { recursive: true, force: true })
      return { installed: false, name }
    }

    // Build consentedPermissions map
    const consentedPermissions = {}
    for (const [key, rune] of Object.entries(pluginJson.runes)) {
      consentedPermissions[key] = collectAllowFromRune(rune)
    }

    await registerPlugin({ name, version, path: isLocal ? stagingDir : cacheDir, cacheDir, local: isLocal, consentedPermissions, ...provenance })
    await setEnabled(projectDir, pluginKey, true, global)

    return { installed: true, name: pluginKey, version }
  } finally {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
    }
  }
}

async function updatePlugin(pluginKey, newPluginDir, newPluginJson, projectDir, isLocal, provenance = {}, options = {}) {
  const { yes = false, global = false } = options
  const registry = await loadRegistry()
  const existing = registry.plugins[pluginKey]
  if (!existing) throw new Error(`Plugin "${pluginKey}" is not installed.`)

  const diff = diffPermissions(existing.consentedPermissions ?? {}, newPluginJson)
  if (Object.keys(diff).length > 0) {
    const consented = await promptReConsent(pluginKey, diff, { yes })
    if (!consented) return { installed: false, name: pluginKey }
  }

  const name = provenance.pluginName
  const version = provenance.version
  if (!name || !version) {
    throw new Error(`Provenance missing plugin identity during update: name="${name}", version="${version}"`)
  }
  const cacheDir = getPluginCacheDir(name, version, provenance.marketplaceName)

  if (!isLocal) {
    await fs.cp(newPluginDir, cacheDir, { recursive: true })
  } else {
    await fs.mkdir(cacheDir, { recursive: true })
  }

  await installDeps(cacheDir, newPluginJson.dependencies)

  const consentedPermissions = {}
  for (const [key, rune] of Object.entries(newPluginJson.runes)) {
    consentedPermissions[key] = collectAllowFromRune(rune)
  }

  await registerPlugin({ name, version, path: isLocal ? newPluginDir : cacheDir, cacheDir, local: isLocal, consentedPermissions, ...provenance })
  await setEnabled(projectDir, pluginKey, true, global)
  return { installed: true, name: pluginKey, version, updated: true }
}

async function setEnabled(projectDir, pluginKey, enabled, global) {
  if (!projectDir && !global) return
  try {
    await setPluginEnabled(getConfigPath({ configRoot: projectDir, global }), pluginKey, enabled)
  } catch {
    // No config to update — skip
  }
}

/** Uninstall drops the key outright: a `false` would outlive the plugin. */
async function removeEnabled(projectDir, pluginKey, global) {
  if (!projectDir && !global) return
  try {
    const configPath = getConfigPath({ configRoot: projectDir, global })
    const config = readRawConfig(configPath)
    if (!config) return
    const plugins = coercePlugins(config.plugins)
    if (!(pluginKey in plugins)) return
    delete plugins[pluginKey]
    config.plugins = plugins
    await writeRawConfig(configPath, config)
  } catch {
    // No config to update — skip
  }
}

export async function uninstallPlugin(pluginKey, projectDir, { global = false } = {}) {
  const registry = await loadRegistry()
  const entry = registry.plugins?.[pluginKey]
  if (!entry) throw new Error(`Plugin "${pluginKey}" is not installed.`)

  try {
    const dirToRemove = entry.cacheDir ?? (entry.local ? null : entry.path)
    if (dirToRemove) {
      const stat = await fs.lstat(dirToRemove)
      if (stat.isSymbolicLink()) {
        await fs.unlink(dirToRemove)
      } else {
        await fs.rm(dirToRemove, { recursive: true, force: true })
      }
    }
  } catch { /* already gone */ }

  await removePlugin(pluginKey)
  await removeEnabled(projectDir, pluginKey, global)
}

