import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { getPnpmStorePath } from '../store/index.js'

const execFileAsync = promisify(execFile)

async function which(cmd) {
  try {
    const shell = process.platform === 'win32'
    const { stdout } = await execFileAsync(
      process.platform === 'win32' ? 'where' : 'which',
      [cmd],
      { shell }
    )
    return stdout.trim().split(/\r?\n/)[0] || null
  } catch {
    return null
  }
}

let _detectedPm = undefined

export async function detectPackageManager() {
  if (_detectedPm !== undefined) return _detectedPm
  if (await which('pnpm')) { _detectedPm = 'pnpm'; return 'pnpm' }
  if (await which('bun'))  { _detectedPm = 'bun';  return 'bun'  }
  _detectedPm = 'npm'
  return 'npm'
}

export async function installDeps(pluginCacheDir, dependencies) {
  if (!dependencies || Object.keys(dependencies).length === 0) return

  const pm = await detectPackageManager()
  const deps = Object.entries(dependencies).map(([name, ver]) => `${name}@${ver}`)

  if (pm === 'pnpm') {
    await execFileAsync('pnpm', [
      'add', ...deps,
      '--dir', pluginCacheDir,
      '--ignore-scripts',
      '--store-dir', getPnpmStorePath(),
    ], { shell: process.platform === 'win32' })

  } else if (pm === 'bun') {
    await execFileAsync('bun', [
      'add', ...deps,
      '--cwd', pluginCacheDir,
      '--ignore-scripts',
    ], { shell: process.platform === 'win32' })

  } else {
    // npm fallback: pack each dep and extract tarball manually
    await installDepsViaNpm(pluginCacheDir, dependencies)
    console.warn('Hint: install pnpm or bun for smaller plugin storage.\n  npm install -g pnpm')
  }
}

async function installDepsViaNpm(pluginCacheDir, dependencies) {
  const nodeModulesDir = path.join(pluginCacheDir, 'node_modules')
  await fs.mkdir(nodeModulesDir, { recursive: true })

  const packageJsonPath = path.join(pluginCacheDir, 'package.json')
  const packageLockJsonPath = path.join(pluginCacheDir, 'package-lock.json')

  // Write minimal package.json
  await fs.writeFile(
    packageJsonPath,
    JSON.stringify({ dependencies }, null, 2),
    'utf8'
  )

  try {
    await execFileAsync('npm', [
      'install',
      '--no-audit',
      '--no-fund',
      '--omit=dev'
    ], {
      cwd: pluginCacheDir,
      shell: process.platform === 'win32'
    })
  } finally {
    // Clean up temporary package.json and lockfile
    await fs.rm(packageJsonPath, { force: true })
    await fs.rm(packageLockJsonPath, { force: true })
  }
}
