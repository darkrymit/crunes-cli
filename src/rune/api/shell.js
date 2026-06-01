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
  constructor(cmd, { dir, env, binary = false }) {
    this.handlers = new Map()
    this.binary = binary
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

  write(chunk) {
    if (chunk && typeof chunk === 'object' && chunk.type === 'Buffer') {
      this.proc.stdin.write(Buffer.from(chunk.data))
    } else if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
      this.proc.stdin.write(chunk)
    } else {
      this.proc.stdin.write(String(chunk))
    }
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
  async function exec(cmd, { throw: shouldThrow = true, trim = true, timeout = 30000, env, stdin, binary = false } = {}) {
    if (checkPermission) checkPermission('shell.exec', cmd)

    const result = await new Promise((resolve, reject) => {
      const proc = spawn(cmd, [], {
        shell:              true,
        cwd:                dir,
        windowsHideConsole: true,
        env: env ? { ...process.env, ...env } : process.env,
      })

      let stdoutParts = []
      let stdout = ''
      let stderr = ''
      let timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        proc.kill()
        reject(new ShellError({
          message: `Command timed out after ${timeout}ms: ${cmd}`,
          stdout: binary ? Buffer.concat(stdoutParts) : stdout,
          stderr,
          exitCode: null,
        }))
      }, timeout)

      // Handle stdin writing/piping
      if (stdin !== undefined && stdin !== null) {
        if (typeof stdin === 'string' || Buffer.isBuffer(stdin) || stdin instanceof Uint8Array) {
          proc.stdin.write(stdin)
          proc.stdin.end()
        } else if (stdin && typeof stdin.pipe === 'function') {
          stdin.pipe(proc.stdin)
        }
      }

      proc.stdout.on('data', chunk => {
        if (binary) {
          stdoutParts.push(chunk)
        } else {
          stdout += chunk
        }
      })
      proc.stderr.on('data', chunk => { stderr += chunk })

      proc.on('close', exitCode => {
        clearTimeout(timer)
        if (timedOut) return
        
        let finalStdout
        if (binary) {
          finalStdout = new Uint8Array(Buffer.concat(stdoutParts))
        } else {
          finalStdout = stdout.replace(/\r\n/g, '\n').replace(ANSI_RE, '')
        }
        stderr = stderr.replace(/\r\n/g, '\n').replace(ANSI_RE, '')
        resolve({ stdout: finalStdout, stderr, exitCode })
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

    if (trim) {
      return binary ? result.stdout : result.stdout.trim()
    }
    return result
  }

  function execInSession(cmd, opts = {}) {
    if (checkPermission) checkPermission('shell.exec', cmd)
    return new ShellSession(cmd, { dir, ...opts })
  }

  return { exec, execInSession }
}
