import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { tailStdin } from '../../job/stdin-tail.js'

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
  constructor(cmd, { dir, env, binary = false, activeSessions }) {
    this.handlers = new Map()
    this.binary = binary
    this.activeSessions = activeSessions
    this._spawnArgs = { cmd, dir, env }
    this.proc = null
  }

  open() {
    const { cmd, dir, env } = this._spawnArgs
    this._pending = []
    this.proc = spawn(cmd, [], {
      shell:              true,
      cwd:                dir,
      windowsHideConsole: true,
      env: env ? { ...process.env, ...env } : process.env,
    })

    if (this.activeSessions) {
      this.activeSessions.add(this)
    }

    this.proc.stdout.on('data', chunk => this.emit('stdout', 'data', chunk))
    this.proc.stderr.on('data', chunk => this.emit('stderr', 'data', chunk))
    this.proc.stdout.on('end', () => this.emit('stdout', 'end'))
    this.proc.stderr.on('end', () => this.emit('stderr', 'end'))

    this.proc.on('exit', async code => {
      if (this._pending.length > 0) await Promise.allSettled(this._pending)
      if (this.activeSessions) this.activeSessions.delete(this)
      this.emit('session', 'exit', code ?? 0)
    })
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
      const handleCatch = err => {
        if (err && err.message !== 'Isolate is disposed') {
          console.error('[crunes:debug] shell callback error:', err)
        }
      }

      if (event === 'data') {
        const arrayBuffer = arg.buffer.slice(arg.byteOffset, arg.byteOffset + arg.byteLength)
        const p = h.apply(undefined, [arrayBuffer], { arguments: { copy: true } })
        if (this._pending) {
          this._pending.push(p)
          p.then(() => { const i = this._pending.indexOf(p); if (i !== -1) this._pending.splice(i, 1) }, () => {})
        }
        p.catch(handleCatch)
      } else if (event === 'error') {
        const errStr = arg instanceof Error ? arg.message : String(arg)
        h.apply(undefined, [errStr], { arguments: { copy: true } }).catch(handleCatch)
      } else if (event === 'exit') {
        h.apply(undefined, [arg], { arguments: { copy: true } }).catch(handleCatch)
      } else {
        h.apply(undefined, [], { arguments: { copy: true } }).catch(handleCatch)
      }
    } else {
      h(arg)
    }
  }

  write(chunk) {
    if (!this.proc) return
    if (chunk && typeof chunk === 'object' && chunk.type === 'Buffer') {
      this.proc.stdin.write(Buffer.from(chunk.data))
    } else if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
      this.proc.stdin.write(chunk)
    } else {
      this.proc.stdin.write(String(chunk))
    }
  }

  terminate() {
    this.handlers.clear()
    this.kill('SIGKILL')
  }

  kill(signal) {
    if (!this.proc) return
    if (this.activeSessions) {
      this.activeSessions.delete(this)
    }
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
  const activeSessions = new Set()

  async function exec(cmd, { throw: shouldThrow = true, trim = true, timeout = 30000, env, stdin, binary = false } = {}) {
    if (checkPermission) checkPermission('shell.run', cmd)

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
      const finalStdout = trim && typeof result.stdout === 'string' ? result.stdout.trim() : result.stdout
      const finalStderr = trim && typeof result.stderr === 'string' ? result.stderr.trim() : result.stderr
      throw new ShellError({
        message: `Command failed (exit ${result.exitCode}): ${cmd}`,
        stdout: finalStdout,
        stderr: finalStderr,
        exitCode: result.exitCode,
      })
    }

    let finalStdout = result.stdout
    let finalStderr = result.stderr
    if (trim) {
      if (typeof finalStdout === 'string') finalStdout = finalStdout.trim()
      if (typeof finalStderr === 'string') finalStderr = finalStderr.trim()
    }

    return {
      stdout: finalStdout,
      stderr: finalStderr,
      exitCode: result.exitCode,
      ok: result.exitCode === 0,
    }
  }

  function execInSession(cmd, opts = {}) {
    if (checkPermission) checkPermission('shell.run', cmd)
    return new ShellSession(cmd, { dir, ...opts, activeSessions })
  }

  async function createShellJob(cmd, opts, { createJob, updateJobPid, jobStdoutPath, jobStderrPath, jobStdinPath, spawnedBy, projectKey, projectDir: jobProjectDir }) {
    const repl = opts?.repl ?? false
    const { id } = await createJob(null, {
      type: 'shell', spawnedBy, runeKey: null, projectDir: jobProjectDir, args: [cmd],
    })
    const outFd = fs.openSync(jobStdoutPath(projectKey, id), 'a')
    const errFd = fs.openSync(jobStderrPath(projectKey, id), 'a')
    let stdinArg = 'ignore'
    let tailHandle = null
    if (repl) {
      const stdinLog = jobStdinPath(projectKey, id)
      fs.writeFileSync(stdinLog, '')
      stdinArg = 'pipe'
      const child = spawn(cmd, [], {
        shell:   true,
        detached: true,
        stdio:   [stdinArg, outFd, errFd],
        cwd:     jobProjectDir,
        env:     opts?.env ? { ...process.env, ...opts.env } : process.env,
        windowsHideConsole: true,
      })
      tailHandle = tailStdin(stdinLog, {
        onLine: (line) => { child.stdin.write(line + '\n') },
        onEof: () => { child.stdin.end() },
      })
      child.on('exit', () => { if (tailHandle) tailHandle.stop() })
      await updateJobPid(projectKey, id, child.pid)
      child.unref()
      fs.closeSync(outFd)
      fs.closeSync(errFd)
      return { id }
    }
    const child = spawn(cmd, [], {
      shell:   true,
      detached: true,
      stdio:   [stdinArg, outFd, errFd],
      cwd:     jobProjectDir,
      env:     opts?.env ? { ...process.env, ...opts.env } : process.env,
      windowsHideConsole: true,
    })
    await updateJobPid(projectKey, id, child.pid)
    child.unref()
    fs.closeSync(outFd)
    fs.closeSync(errFd)
    return { id }
  }

  return {
    exec,
    spawn: execInSession,
    createShellJob,
    dispose() {
      for (const session of activeSessions) {
        try {
          session.terminate()
        } catch {}
      }
      activeSessions.clear()
    }
  }
}
