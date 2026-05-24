import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loadPluginJson } from './manifest.js'
import { getPluginCacheDir, ensureStoreDirs } from '../store/index.js'
import { registerPlugin, loadRegistry, removePlugin } from './registry.js'
import { installDeps } from './deps.js'
import { promptConsent, diffPermissions, promptReConsent } from './consent.js'

const execFileAsync = promisify(execFile)

function collectAllowFromRune(rune) {
  const all = []
  for (const lifecycle of Object.values(rune.permissions ?? {})) {
    for (const perm of lifecycle?.allow ?? []) {
      if (!all.includes(perm)) all.push(perm)
    }
  }
  return all
}

/**
 * Resolve a source string to { type, resolved }
 *   type: 'local' | 'github' | 'git' | 'npm'
 */
function classifySource(source) {
  if (source.startsWith('.') || source.startsWith('/') || source.startsWith('~') || /^[A-Za-z]:[/\\]/.test(source)) {
    return { type: 'local', resolved: source.replace(/^~/, os.homedir()) }
  }
  if (source.startsWith('https://') || source.startsWith('git+')) {
    return { type: 'git', resolved: source }
  }
  if (/^[\w-]+\/[\w.-]+$/.test(source) || source.startsWith('github:')) {
    const repo = source.replace(/^github:/, '')
    return { type: 'github', resolved: `https://github.com/${repo}` }
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
  await execFileAsync('tar', ['-xzf', tarPath, '-C', destDir, '--strip-components=1'], { shell: process.platform === 'win32' })
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
    await execFileAsync('tar', ['-xzf', path.join(tmp, tarball), '-C', destDir, '--strip-components=1'], { shell: process.platform === 'win32' })
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
export async function installPlugin(source, projectDir, provenance = {}) {
  if (!provenance.marketplaceName) {
    throw new Error('Direct installs are not allowed. Use: crunes plugin install <marketplace>@<plugin>')
  }
  await ensureStoreDirs()

  const { type, resolved } = classifySource(source)

  // For local installs, load plugin.json first to get name/version
  let stagingDir
  if (type === 'local') {
    stagingDir = path.resolve(resolved)
  } else {
    stagingDir = path.join(os.tmpdir(), `crunes-install-${Date.now()}`)
    await fs.mkdir(stagingDir, { recursive: true })
  }

  try {
    if (type === 'github') await downloadGitHub(resolved, stagingDir)
    else if (type === 'git') await downloadGit(resolved, stagingDir)
    else if (type === 'npm') await downloadNpm(resolved, stagingDir)
    // local: stagingDir already points to the plugin

    const pluginJson = await loadPluginJson(stagingDir)
    const { name, version } = pluginJson
    const pluginKey = `${provenance.marketplaceName}@${name}`

    // Check if already installed — if so, handle as update
    const registry = await loadRegistry()
    const existing = registry.plugins?.[pluginKey]
    if (existing) {
      return await updatePlugin(pluginKey, stagingDir, pluginJson, projectDir, type === 'local', provenance)
    }

    const isLocal = type === 'local'
    const cacheDir = isLocal ? stagingDir : getPluginCacheDir(name, version, provenance.marketplaceName)

    // Copy to cache dir (local installs use the source dir directly)
    if (!isLocal) {
      await fs.cp(stagingDir, cacheDir, { recursive: true })
    }

    // Install declared dependencies
    await installDeps(cacheDir, pluginJson.dependencies)

    // Consent
    const consented = await promptConsent(pluginJson)
    if (!consented) {
      if (!isLocal) await fs.rm(cacheDir, { recursive: true, force: true })
      return { installed: false, name }
    }

    // Build consentedPermissions map
    const consentedPermissions = {}
    for (const [key, rune] of Object.entries(pluginJson.runes)) {
      consentedPermissions[key] = collectAllowFromRune(rune)
    }

    await registerPlugin({ name, version, path: cacheDir, local: isLocal, consentedPermissions, ...provenance })
    await addPluginToProjectConfig(projectDir, pluginKey)

    return { installed: true, name: pluginKey, version }
  } finally {
    if (type !== 'local') {
      await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

async function updatePlugin(pluginKey, newPluginDir, newPluginJson, projectDir, isLocal, provenance = {}) {
  const registry = await loadRegistry()
  const existing = registry.plugins[pluginKey]
  if (!existing) throw new Error(`Plugin "${pluginKey}" is not installed.`)

  const diff = diffPermissions(existing.consentedPermissions ?? {}, newPluginJson)
  if (Object.keys(diff).length > 0) {
    const consented = await promptReConsent(pluginKey, diff)
    if (!consented) return { installed: false, name: pluginKey }
  }

  const { name, version } = newPluginJson
  const cacheDir = getPluginCacheDir(name, version, provenance.marketplaceName)

  if (!isLocal) {
    await fs.cp(newPluginDir, cacheDir, { recursive: true })
  }

  await installDeps(cacheDir, newPluginJson.dependencies)

  const consentedPermissions = {}
  for (const [key, rune] of Object.entries(newPluginJson.runes)) {
    consentedPermissions[key] = collectAllowFromRune(rune)
  }

  await registerPlugin({ name, version, path: isLocal ? newPluginDir : cacheDir, consentedPermissions, ...provenance })
  await addPluginToProjectConfig(projectDir, pluginKey)
  return { installed: true, name: pluginKey, version, updated: true }
}

async function addPluginToProjectConfig(projectDir, pluginName) {
  if (!projectDir) return
  const configPath = path.join(projectDir, '.crunes', 'config.json')
  try {
    const raw = await fs.readFile(configPath, 'utf8')
    const config = JSON.parse(raw)
    const plugins = config.plugins ?? []
    if (!plugins.includes(pluginName)) {
      config.plugins = [...plugins, pluginName]
      const tmp = configPath + '.tmp'
      await fs.writeFile(tmp, JSON.stringify(config, null, 2), 'utf8')
      await fs.rename(tmp, configPath)
    }
  } catch {
    // No config.json — skip
  }
}

export async function uninstallPlugin(pluginKey, projectDir) {
  const registry = await loadRegistry()
  const entry = registry.plugins?.[pluginKey]
  if (!entry) throw new Error(`Plugin "${pluginKey}" is not installed.`)

  if (!entry.local) {
    try {
      const stat = await fs.lstat(entry.path)
      if (stat.isSymbolicLink()) {
        await fs.unlink(entry.path)
      } else {
        await fs.rm(entry.path, { recursive: true, force: true })
      }
    } catch { /* already gone */ }
  }

  await removePlugin(pluginKey)
  await removePluginFromProjectConfig(projectDir, pluginKey)
}

async function removePluginFromProjectConfig(projectDir, pluginName) {
  if (!projectDir) return
  const configPath = path.join(projectDir, '.crunes', 'config.json')
  try {
    const raw = await fs.readFile(configPath, 'utf8')
    const config = JSON.parse(raw)
    config.plugins = (config.plugins ?? []).filter(p => p !== pluginName)
    const tmp = configPath + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(config, null, 2), 'utf8')
    await fs.rename(tmp, configPath)
  } catch { /* no config */ }
}
