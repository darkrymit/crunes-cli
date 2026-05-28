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

export class ShellSession {
  constructor(cmd, { dir, env }) {
    this.handlers = new Map()
    this.proc = spawn(cmd, [], {
      shell:              true,
      cwd:                dir,
      windowsHideConsole: true,
      env: env ? { ...process.env, ...env } : process.env,
    })

    this.proc.stdout.on('data', chunk => this.emit('stdout', 'data', chunk))
    this.proc.stderr.on('data', chunk => this.emit('stderr', 'data', chunk))
    this.proc.stdout.on('end', () => this.emit('stdout', 'end'))
    this.proc.stderr.on('end', () => this.emit('stderr', 'end'))
    
    this.proc.on('exit', code => this.emit('session', 'exit', code ?? 0))
    this.proc.on('error', err => this.emit('session', 'error', err))
  }

  setHandler(type, event, callbackRef) {
    const key = `${type}:${event}`
    this.handlers.set(key, callbackRef)
  }

  emit(type, event, arg) {
    const key = `${type}:${event}`
    const h = this.handlers.get(key)
    if (!h) return

    if (typeof h === 'object' && h.apply) {
      if (event === 'data') {
        const arrayBuffer = arg.buffer.slice(arg.byteOffset, arg.byteOffset + arg.byteLength)
        h.apply(undefined, [arrayBuffer], { arguments: { copy: true } }).catch(err => {
          console.error('[crunes:debug] shell callback error:', err)
        })
      } else if (event === 'error') {
        const errStr = arg instanceof Error ? arg.message : String(arg)
        h.apply(undefined, [errStr], { arguments: { copy: true } }).catch(err => {
          console.error('[crunes:debug] shell callback error:', err)
        })
      } else if (event === 'exit') {
        h.apply(undefined, [arg], { arguments: { copy: true } }).catch(err => {
          console.error('[crunes:debug] shell callback error:', err)
        })
      } else {
        h.apply(undefined, [], { arguments: { copy: true } }).catch(err => {
          console.error('[crunes:debug] shell callback error:', err)
        })
      }
    } else {
      h(arg)
    }
  }

  write(text) {
    this.proc.stdin.write(text)
  }

  kill(signal) {
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', String(this.proc.pid), '/t', '/f'], { windowsHideConsole: true })
      } catch (e) {
        this.proc.kill()
      }
    } else {
      this.proc.kill(signal ?? 'SIGTERM')
    }
  }
}

export function createShellUtils(dir, checkPermission) {
  async function exec(cmd, { throw: shouldThrow = true, trim = true, timeout = 30000, env } = {}) {
    if (checkPermission) checkPermission('shell.exec', cmd)

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

  function execInSession(cmd, { env } = {}) {
    if (checkPermission) checkPermission('shell.exec', cmd)
    return new ShellSession(cmd, { dir, env })
  }

  return { exec, execInSession }
}
