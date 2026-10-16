import { readFileSync } from 'node:fs'
import path from 'node:path'
import { resolveShell, defaultDeps } from '../api/shell-resolve.js'
import { isPathCommand } from '../../shared/command.js'

export { isPathCommand }

const ISOLATE_FILE = /\.rune\.m?js$/i
const RUNTIME_BY_EXTENSION = {
  '.js': 'node',
  '.mjs': 'node',
  '.cjs': 'node',
  '.py': 'python',
  '.sh': 'bash',
}

/**
 * The runtime a run block's command selects:
 * 'isolate' | 'node' | 'python' | 'bash' | 'file' (executed directly) | 'program' (looked up on PATH).
 */
export function runtimeOf(command) {
  if (!isPathCommand(command)) return 'program'
  if (ISOLATE_FILE.test(command)) return 'isolate'
  return RUNTIME_BY_EXTENSION[path.extname(command).toLowerCase()] ?? 'file'
}

export class InterpreterNotFoundError extends Error {
  constructor(runtime, tried, hint) {
    super(`No ${runtime} interpreter found. Tried:\n  ${tried.join('\n  ')}\n${hint}`)
    this.name = 'InterpreterNotFoundError'
    this.tried = tried
  }
}

export function onPath(name, deps = defaultDeps()) {
  const names = deps.platform === 'win32' ? [`${name}.exe`, name] : [name]
  for (const dir of deps.pathDirs) {
    for (const n of names) {
      const candidate = path.join(dir, n)
      if (deps.exists(candidate)) return candidate
    }
  }
  return null
}

/** First Python that exists: CRUNES_PYTHON, the active virtualenv, a project .venv/ or venv/, then PATH. */
export function findPython(projectDir, deps = defaultDeps()) {
  const win = deps.platform === 'win32'
  const venvPython = dir => win ? path.join(dir, 'Scripts', 'python.exe') : path.join(dir, 'bin', 'python')
  const tried = []
  const attempt = (label, candidate, args = [], missing = '(unset)') => {
    tried.push(candidate ? `${label}: ${candidate}` : `${label}: ${missing}`)
    return candidate && deps.exists(candidate) ? { command: candidate, args } : null
  }

  const found =
    attempt('CRUNES_PYTHON', deps.env.CRUNES_PYTHON) ??
    attempt('VIRTUAL_ENV', deps.env.VIRTUAL_ENV && venvPython(deps.env.VIRTUAL_ENV)) ??
    attempt('.venv', venvPython(path.join(projectDir, '.venv'))) ??
    attempt('venv', venvPython(path.join(projectDir, 'venv'))) ??
    attempt('python3', onPath('python3', deps), [], '(not on PATH)') ??
    attempt('python', onPath('python', deps), [], '(not on PATH)') ??
    (win ? attempt('py -3', onPath('py', deps), ['-3'], '(not on PATH)') : null)

  if (found) return found
  throw new InterpreterNotFoundError('Python', tried, 'Install Python, or set CRUNES_PYTHON to the interpreter to use.')
}

const pythonCache = new Map()

/**
 * The interpreter a runtime needs as { command, args }, or null when the handler
 * is executed directly (a program, or a file with no known extension).
 */
export function resolveInterpreter(runtime, projectDir) {
  switch (runtime) {
    case 'node':
      return { command: process.execPath, args: [] }
    case 'python': {
      if (!pythonCache.has(projectDir)) pythonCache.set(projectDir, findPython(projectDir))
      return pythonCache.get(projectDir)
    }
    case 'bash':
      return { command: resolveShell('bash').path, args: [] }
    default:
      return null
  }
}

const UTILS_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]@utils['"]/

/**
 * A plain .js/.mjs handler runs as native Node, which can never import @utils —
 * so one that does is an isolate module that was not renamed to *.rune.js.
 */
export function assertNotMissedRename(file, runtime, projectDir = null) {
  if (runtime !== 'node') return
  let source
  try { source = readFileSync(file, 'utf8') } catch { return }
  if (!UTILS_IMPORT.test(source)) return
  const shown = projectDir ? path.relative(projectDir, file).replace(/\\/g, '/') : file
  const renamed = shown.replace(/\.(m?js|cjs)$/i, '.rune.$1')
  throw new Error(
    `${shown} imports @utils but is named as a native Node script.\n` +
    `A run block runs plain .js files with Node, outside the sandbox. To keep it in the isolate, rename it:\n` +
    `  mv ${shown} ${renamed}\n` +
    `and point run.command at the new name.`
  )
}
