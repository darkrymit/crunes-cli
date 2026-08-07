import { scanCommand, ScanRefusal } from './shell-scan.js'
import { PermissionError } from './permissions.js'

/**
 * Side-effect-free shell builtins that pass without a grant. Requiring
 * shell.run:echo * everywhere would fill every config with noise and teach
 * users to grant reflexively, which costs more security than it buys.
 */
export const BUILTIN_ALLOWLIST = new Set([
  'cd', 'echo', 'printf', 'test', '[', 'pwd',
  'true', 'false', 'export', 'set', 'unset', 'shift', 'read', ':',
])

/**
 * Check every command position and redirect target in a command string.
 * Throws PermissionError on the first failure. Fail-closed: a command that
 * cannot be scanned is denied regardless of what grants exist.
 */
export function checkShellCommand(cmd, shellKind, checkPermission) {
  if (!checkPermission) return

  let scanned
  try {
    scanned = scanCommand(cmd, shellKind)
  } catch (e) {
    if (e instanceof ScanRefusal) {
      throw new PermissionError('shell.run', cmd, 'unscannable', {
        construct: e.construct,
        offset:    e.offset,
      })
    }
    throw e
  }

  for (const command of scanned.commands) {
    if (BUILTIN_ALLOWLIST.has(command.program)) continue
    checkPermission('shell.run', command.segment)
  }

  for (const redirect of scanned.redirects) {
    checkPermission(redirect.mode === 'write' ? 'fs.write' : 'fs.read', redirect.target)
  }
}
