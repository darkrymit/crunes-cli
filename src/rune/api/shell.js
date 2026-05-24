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

class ShellSession {
  constructor(cmd, { dir, env }) {
    this.buffer = ''
    this.waiters = new Set()
    
    this.proc = spawn(cmd, [], {
      shell:              true,
      cwd:                dir,
      windowsHideConsole: true,
      env: env ? { ...process.env, ...env } : process.env,
    })

    this.exitPromise = new Promise((resolve) => {
      this.proc.on('close', (code) => resolve(code ?? 1))
      this.proc.on('error', () => resolve(1))
    })

    const handleData = (chunk) => {
      const text = chunk.toString().replace(/\r\n/g, '\n').replace(ANSI_RE, '')
      this.buffer += text
      
      for (const waiter of this.waiters) {
        let match = false
        if (typeof waiter.pattern === 'string' && this.buffer.includes(waiter.pattern)) {
          match = true
        } else if (waiter.pattern instanceof RegExp && waiter.pattern.test(this.buffer)) {
          match = true
        }

        if (match) {
          clearTimeout(waiter.timer)
          this.waiters.delete(waiter)
          waiter.resolve(this.buffer)
        }
      }
    }

    this.proc.stdout.on('data', handleData)
    this.proc.stderr.on('data', handleData)
  }

  write(text) {
    this.proc.stdin.write(text)
  }

  expect(pattern, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      let match = false
      if (typeof pattern === 'string' && this.buffer.includes(pattern)) {
        match = true
      } else if (pattern instanceof RegExp && pattern.test(this.buffer)) {
        match = true
      }

      if (match) {
        return resolve(this.buffer)
      }

      const waiter = { pattern, resolve, reject }
      waiter.timer = setTimeout(() => {
        this.waiters.delete(waiter)
        reject(new Error(`Timeout waiting for ${pattern}`))
      }, timeoutMs)
      
      this.waiters.add(waiter)
    })
  }

  output() {
    return this.buffer
  }

  waitForExit() {
    return this.exitPromise
  }

  kill() {
    this.proc.kill()
  }
}

export function createShellUtils(dir, checkPermission) {
  async function run(cmd, { throw: shouldThrow = true, trim = true, timeout = 30000, env } = {}) {
    if (checkPermission) checkPermission('shell.run', cmd)

    const result = await new Promise((resolve, reject) => {
      const proc = spawn(cmd, [], {
        shell:              true,
        cwd:                dir,
        windowsHideConsole: true,
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

  function session(cmd, { env } = {}) {
    if (checkPermission) checkPermission('shell.run', cmd)
    return new ShellSession(cmd, { dir, env })
  }

  return { run, session }
}
