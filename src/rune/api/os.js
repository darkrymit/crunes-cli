import { resolveShell } from './shell-resolve.js'

/**
 * Non-identifying host facts, injected into the isolate as a frozen object.
 *
 * Deliberately excludes tmpdir, homedir, hostname, username, cpus and memory.
 * On Windows tmpdir resolves to C:\Users\<name>\AppData\Local\Temp, which would
 * expose the username to every rune, including third-party plugin runes, with
 * no grant. Any future identifying field needs its own gated capability.
 */
export function createOsInfo() {
  let shell
  try {
    shell = resolveShell(undefined).kind
  } catch {
    // No usable shell on this host. os.shell still has to answer something, and
    // the shell APIs will throw with a far better message when actually called.
    shell = process.platform === 'win32' ? 'cmd' : 'sh'
  }
  return {
    platform: process.platform,
    arch:     process.arch,
    shell,
    pathSep:  process.platform === 'win32' ? '\\' : '/',
    eol:      process.platform === 'win32' ? '\r\n' : '\n',
  }
}
