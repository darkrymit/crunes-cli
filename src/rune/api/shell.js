import { spawn } from 'node:child_process'

const ANSI_RE = /\x1b\[[0-9;]*m/g

export class ShellError extends Error {
  constructor({ message, stdout, stderr, exitCode }) {
    super(message)
    this.name = 'ShellError'
    this.stdout = stdout
    this.stderr = stderr
    this.exitCode = exitCode
  }
}

export function createShellUtils(dir, checkPermission) {
  return async function shell(cmd, { throw: shouldThrow = true, trim = true, timeout = 30000, env } = {}) {
    if (checkPermission) checkPermission('shell', cmd)

    const result = await new Promise((resolve, reject) => {
      const proc = spawn(cmd, [], {
        shell: true,
        cwd: dir,
        env: env ? { ...process.env, ...env } : process.env,
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        proc.kill()
        reject(new ShellError({
          message: `Command timed out after ${timeout}ms: ${cmd}`,
          stdout,
          stderr,
          exitCode: null,
        }))
      }, timeout)

      proc.stdout.on('data', chunk => { stdout += chunk })
      proc.stderr.on('data', chunk => { stderr += chunk })

      proc.on('close', exitCode => {
        clearTimeout(timer)
        if (timedOut) return
        // normalise line endings + strip ANSI
        stdout = stdout.replace(/\r\n/g, '\n').replace(ANSI_RE, '')
        stderr = stderr.replace(/\r\n/g, '\n').replace(ANSI_RE, '')
        resolve({ stdout, stderr, exitCode })
      })

      proc.on('error', err => {
        clearTimeout(timer)
        reject(err)
      })
    })

    if (result.exitCode !== 0 && shouldThrow) {
      throw new ShellError({
        message: `Command failed (exit ${result.exitCode}): ${cmd}`,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      })
    }

    if (trim) return result.stdout.trim()
    return result
  }
}
