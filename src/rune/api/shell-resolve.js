import { existsSync } from 'node:fs'
import path from 'node:path'

export class ShellResolutionError extends Error {
  constructor(message, { mode, tried }) {
    super(message)
    this.name = 'ShellResolutionError'
    this.mode = mode
    this.tried = tried
  }
}

/**
 * C:\Windows\System32\bash.exe is the WSL launcher, not a native bash. It runs
 * inside a Linux VM with a different filesystem root, so a Win32 cwd fails and
 * paths silently resolve against /mnt/c/... . It is on PATH by default on
 * current Windows, so a naive PATH scan picks it first on most machines.
 * It must never be selected, including via CRUNES_BASH.
 */
function isWslLauncher(candidate, env) {
  const systemRoot = (env.SystemRoot ?? 'C:\\Windows').replace(/\\/g, '/').toLowerCase()
  const p = String(candidate).replace(/\\/g, '/').toLowerCase()
  return p.startsWith(`${systemRoot}/system32/`)
}

export function bashCandidates(deps) {
  const { platform, env, pathDirs } = deps
  if (platform !== 'win32') {
    return ['/bin/bash', '/usr/bin/bash', ...pathDirs.map(d => path.posix.join(d, 'bash'))]
  }
  const out = []
  if (env.ProgramFiles)        out.push(path.win32.join(env.ProgramFiles, 'Git', 'bin', 'bash.exe'))
  if (env['ProgramFiles(x86)']) out.push(path.win32.join(env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'))
  if (env.LOCALAPPDATA)        out.push(path.win32.join(env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'))
  for (const dir of pathDirs) {
    const candidate = path.win32.join(dir, 'bash.exe')
    if (isWslLauncher(candidate, env)) continue
    out.push(candidate)
  }
  return out
}

function findBash(deps) {
  const { env, exists } = deps
  const tried = bashCandidates(deps)
  for (const candidate of tried) {
    if (exists(candidate)) return { path: candidate, tried }
  }
  // Consulted last, never first: it can rescue a machine the probe list misses,
  // but it cannot silently redirect a machine where the probe already succeeds.
  const override = env.CRUNES_BASH
  if (override && exists(override) && !isWslLauncher(override, env)) {
    return { path: override, tried: [...tried, override] }
  }
  return { path: null, tried: override ? [...tried, override] : tried }
}

function findSh(deps) {
  if (deps.platform === 'win32') return null
  return deps.exists('/bin/sh') ? '/bin/sh' : null
}

function findCmd(deps) {
  if (deps.platform !== 'win32') return null
  return deps.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe'
}

let cached = null

export function resetShellCache() {
  cached = null
}

export function defaultDeps() {
  const sep = process.platform === 'win32' ? ';' : ':'
  return {
    platform: process.platform,
    env:      process.env,
    exists:   p => { try { return existsSync(p) } catch { return false } },
    pathDirs: (process.env.PATH ?? '').split(sep).filter(Boolean),
  }
}

/**
 * mode: 'bash' | 'cmd' | undefined
 *  - 'bash'    -> must resolve bash, never falls back
 *  - 'cmd'     -> win32 only, never falls back
 *  - undefined -> bash, then sh, then cmd
 */
export function resolveShell(mode, deps = null) {
  const d = deps ?? defaultDeps()
  const useCache = deps === null

  if (mode !== undefined && mode !== 'bash' && mode !== 'cmd') {
    throw new ShellResolutionError(`Unknown shell mode: '${mode}'. Expected 'bash', 'cmd', or undefined.`, { mode, tried: [] })
  }

  if (useCache && cached && cached[String(mode)]) return cached[String(mode)]

  let result
  if (mode === 'bash') {
    const { path: bash, tried } = findBash(d)
    if (!bash) {
      throw new ShellResolutionError(
        `shell: 'bash' was requested but no bash was found. Tried:\n  ${tried.join('\n  ')}\n` +
        `Set CRUNES_BASH to an absolute bash path if it is installed elsewhere.`,
        { mode, tried },
      )
    }
    result = { kind: 'bash', path: bash }
  } else if (mode === 'cmd') {
    const cmd = findCmd(d)
    if (!cmd) {
      throw new ShellResolutionError(`shell: 'cmd' is only available on Windows (platform is '${d.platform}').`, { mode, tried: [] })
    }
    result = { kind: 'cmd', path: cmd }
  } else {
    const { path: bash, tried } = findBash(d)
    if (bash) {
      result = { kind: 'bash', path: bash }
    } else {
      const sh = findSh(d)
      if (sh) {
        result = { kind: 'sh', path: sh }
      } else {
        const cmd = findCmd(d)
        if (!cmd) {
          throw new ShellResolutionError(
            `No usable shell found. Tried bash:\n  ${tried.join('\n  ')}\nthen /bin/sh.`,
            { mode, tried: [...tried, '/bin/sh'] },
          )
        }
        result = { kind: 'cmd', path: cmd }
      }
    }
  }

  if (useCache) {
    cached ??= {}
    cached[String(mode)] = result
  }
  return result
}
