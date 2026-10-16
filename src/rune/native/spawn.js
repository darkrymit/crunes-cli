import { spawn, spawnSync } from 'node:child_process'
import { constants } from 'node:os'

/** Exit status for a script stopped by its timeout — the convention of timeout(1). */
export const TIMEOUT_STATUS = 124
/** How long a timed-out script has to exit after SIGTERM before it is killed. */
const KILL_GRACE_MS = 5_000

/** Exit status for a child that ended on a signal: the shell convention, 128 + the signal number. */
function signalStatus(signal) {
  return 128 + (constants.signals[signal] ?? 0)
}

/**
 * Stop a timed-out script and the processes it started. A script's children hold its output
 * pipe open, so stopping the script alone would leave crunes waiting on them. Windows stops the
 * whole tree; elsewhere the script's direct children are signalled alongside it.
 */
function stopTree(child, signal) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    return
  }
  spawnSync('pkill', [`-${signal.replace(/^SIG/, '')}`, '-P', String(child.pid)])
  child.kill(signal)
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
 *
 * With onLine, standard output is read line by line in either mode and handed to onLine as each
 * line completes, instead of being collected or inherited.
 *
 * With timeoutMs, a script still running when it expires is sent SIGTERM, then SIGKILL after a
 * grace period; it ends with status 124 when run directly, and fails the rune when captured.
 */
export function spawnNative({ key, file, argv, env, cwd, direct, stdin = 'inherit', onLine = null, timeoutMs = null }) {
  const [command, ...args] = argv
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: direct
          ? ['inherit', onLine ? 'pipe' : 'inherit', 'inherit']
          : [stdin, 'pipe', 'inherit'],
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
    let timedOut = false
    let killTimer = null
    const timer = timeoutMs == null ? null : setTimeout(() => {
      timedOut = true
      stopTree(child, 'SIGTERM')
      killTimer = setTimeout(() => {
        stopTree(child, 'SIGKILL')
        child.stdout?.destroy()
      }, KILL_GRACE_MS)
    }, timeoutMs)
    const detach = () => {
      process.off('SIGINT', ignoreInterrupt)
      for (const [signal, handler] of Object.entries(forwarders)) process.off(signal, handler)
      clearTimeout(timer)
      clearTimeout(killTimer)
    }

    let stdout = ''
    let pending = ''
    if (onLine) {
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', chunk => {
        pending += chunk
        let nl
        while ((nl = pending.indexOf('\n')) !== -1) {
          onLine(pending.slice(0, nl).replace(/\r$/, ''))
          pending = pending.slice(nl + 1)
        }
      })
    } else if (!direct) {
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', chunk => { stdout += chunk })
    }

    child.on('error', err => { detach(); reject(notFound(key, file, err)) })
    child.on('close', (code, signal) => {
      detach()
      if (onLine && pending) onLine(pending.replace(/\r$/, ''))
      if (timedOut) {
        const message = `Rune "${key}" timed out after ${timeoutMs / 1000}s and was stopped.`
        if (!direct) { reject(new Error(message)); return }
        process.stderr.write(`[crunes] ${message}\n`)
        resolve({ exitCode: TIMEOUT_STATUS })
        return
      }
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
