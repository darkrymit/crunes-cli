import { spawn, spawnSync } from 'node:child_process'
import { openSync, closeSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Starts a background job that must outlive the spawning CLI process.
//
// On Windows `CreateProcess` is called with bInheritHandles=TRUE, so a child receives
// every inheritable handle the parent holds — including the stdout pipe, whatever
// `stdio` says. A detached job therefore keeps that pipe open for its whole lifetime,
// and `crunes run <rune> | head` blocks until the job dies even though the CLI exited
// seconds earlier.
//
// Neither `stdio: 'ignore'` nor `cmd /c start /b` avoids this. `Start-Process` does —
// but only without `-RedirectStandardOutput/-Error`, which force handle inheritance
// back on. Since jobs must capture stdout to their log files, the launch goes through a
// shim: Start-Process (no redirects, so it inherits nothing) runs the shim, and the shim
// spawns the real job with its own file descriptors. The shim reports the job's pid,
// which the registry needs for `job kill` / `job list`.
//
// The job never reads real stdin — repl jobs receive input through CRUNES_STDIN_LOG —
// so dropping the stdin channel is safe.

const psQuote = s => `'${String(s).replace(/'/g, "''")}'`

// Start-Process joins -ArgumentList with spaces and does not quote the elements for the
// target's command line, so an argument containing a space (any project path can) would
// arrive split. Embed real double quotes in each element to keep it one argument.
const psArg = s => psQuote(`"${String(s).replace(/"/g, '\\"')}"`)

const SHIM = `
import { spawn } from 'node:child_process'
import { openSync, closeSync, writeFileSync } from 'node:fs'
const spec = JSON.parse(process.env.CRUNES_JOB_SPEC)
const out = openSync(spec.outPath, 'a')
const err = openSync(spec.errPath, 'a')
const child = spawn(spec.command, spec.args, {
  detached: true, stdio: ['ignore', out, err], cwd: spec.cwd || undefined,
  shell: spec.shell, windowsHide: true,
})
child.unref()
closeSync(out)
closeSync(err)
writeFileSync(spec.pidPath, String(child.pid))
`

function spawnViaShim(command, args, { outPath, errPath, env, cwd, shell }) {
  const jobDir = dirname(outPath)
  const shimPath = join(jobDir, 'launch.mjs')
  const pidPath = join(jobDir, 'launch.pid')
  writeFileSync(shimPath, SHIM)
  if (existsSync(pidPath)) unlinkSync(pidPath)

  // The spec travels as JSON in the environment, not on a command line, so a shell
  // command or a multi-line inline script needs no quoting of its own — only the shim's
  // path is ever passed as an argument.
  const spec = JSON.stringify({ command, args, outPath, errPath, pidPath, cwd: cwd ?? null, shell: !!shell })
  const psCommand = [
    '$p = Start-Process',
    '-FilePath', psQuote(process.execPath),
    '-ArgumentList', psArg(shimPath),
    '-WindowStyle', 'Hidden', '-PassThru; $p.Id',
  ].join(' ')

  const res = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', psCommand],
    // Falling back to process.env matters: spreading an undefined env would hand the job
    // an environment with no PATH.
    { encoding: 'utf8', env: { ...(env ?? process.env), CRUNES_JOB_SPEC: spec } }
  )
  if (!parseInt((res.stdout ?? '').trim(), 10)) {
    throw new Error(`Failed to launch job: ${(res.stderr || res.stdout || '').trim() || 'shim did not start'}`)
  }

  // The shim spawns the job and writes its pid; it exits almost immediately.
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (existsSync(pidPath)) {
      const pid = parseInt(readFileSync(pidPath, 'utf8').trim(), 10)
      if (Number.isInteger(pid)) {
        try { unlinkSync(pidPath) } catch { /* best effort */ }
        try { unlinkSync(shimPath) } catch { /* best effort */ }
        return { pid }
      }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  }
  throw new Error('Job launcher did not report a pid')
}

export function spawnDetachedJob(command, args = [], { outPath, errPath, env, cwd, shell = false } = {}) {
  if (process.platform === 'win32') {
    return spawnViaShim(command, args, { outPath, errPath, env, cwd, shell })
  }

  const outFd = openSync(outPath, 'a')
  const errFd = openSync(errPath, 'a')
  const child = spawn(command, args, {
    detached: true,
    stdio: ['ignore', outFd, errFd],
    env,
    cwd,
    shell,
    windowsHide: true,
  })
  child.unref()
  closeSync(outFd)
  closeSync(errFd)
  return { pid: child.pid }
}
