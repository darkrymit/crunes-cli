import { spawn } from 'node:child_process'
import { constants } from 'node:os'

/** Exit status for a child that ended on a signal: the shell convention, 128 + the signal number. */
function signalStatus(signal) {
  return 128 + (constants.signals[signal] ?? 0)
}

function notFound(key, command, err) {
  if (err.code === 'ENOENT') return new Error(`Rune "${key}": cannot run "${command}" — not found.`)
  if (err.code === 'EACCES') return new Error(`Rune "${key}": cannot run "${command}" — not executable.`)
  return err
}

/**
 * Spawn a native handler.
 *
 * direct   — the caller's streams are the script's; resolves { exitCode } with the script's own status.
 * captured — standard output is collected and returned as the rune's result; standard error passes
 *            through; a non-zero exit rejects. stdin: 'inherit' or 'ignore' (closed, as in a batch).
 */
export function spawnNative({ key, file, argv, env, cwd, direct, stdin = 'inherit' }) {
  const [command, ...args] = argv
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: direct ? 'inherit' : [stdin, 'pipe', 'inherit'],
        windowsHide: true,
      })
    } catch (err) {
      reject(notFound(key, file, err))
      return
    }

    // A terminal interrupt reaches the whole foreground process group, so the script
    // already receives it; crunes stays alive to report the script's status. Signals
    // sent to crunes alone are passed on.
    const ignoreInterrupt = () => {}
    const forward = signal => () => child.kill(signal)
    const forwarders = { SIGTERM: forward('SIGTERM'), SIGHUP: forward('SIGHUP') }
    process.on('SIGINT', ignoreInterrupt)
    for (const [signal, handler] of Object.entries(forwarders)) process.on(signal, handler)
    const detach = () => {
      process.off('SIGINT', ignoreInterrupt)
      for (const [signal, handler] of Object.entries(forwarders)) process.off(signal, handler)
    }

    let stdout = ''
    if (!direct) {
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', chunk => { stdout += chunk })
    }

    child.on('error', err => { detach(); reject(notFound(key, file, err)) })
    child.on('close', (code, signal) => {
      detach()
      const status = code ?? signalStatus(signal)
      if (direct) {
        resolve({ exitCode: status })
        return
      }
      if (status !== 0) {
        reject(new Error(`Rune "${key}" exited with status ${status}${signal ? ` (${signal})` : ''}.`))
        return
      }
      resolve({ stdout: stdout.endsWith('\n') ? stdout.slice(0, -1) : stdout })
    })
  })
}
