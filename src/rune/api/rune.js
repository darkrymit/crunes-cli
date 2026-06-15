import { spawn } from 'node:child_process'

export class RuneSession {
  constructor(runeKey, args, { cliPath, projectDir, repl = false }) {
    this.handlers = new Map()
    this._spawnArgs = { runeKey, args, cliPath, projectDir }
    this._repl = repl
    this.proc = null
    this._pending = null
  }

  open() {
    const { runeKey, args, cliPath, projectDir } = this._spawnArgs
    this._pending = []
    const cliArgs = this._repl
      ? [cliPath, '--cwd', projectDir, 'repl', '--format', 'jsonl', runeKey, ...(args ?? [])]
      : [cliPath, '--cwd', projectDir, 'run', '--format', 'jsonl', runeKey, ...(args ?? [])]
    this.proc = spawn(
      process.execPath,
      cliArgs,
      {
        stdio: [this._repl ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        env: { ...process.env, CRUNES_NO_TIMEOUT: '1' },
        windowsHideConsole: true,
      }
    )
    this.proc.stdout.on('data', chunk => this.emit('stdout', 'data', chunk))
    this.proc.stderr.on('data', chunk => this.emit('stderr', 'data', chunk))
    this.proc.stdout.on('end', () => this.emit('stdout', 'end'))
    this.proc.stderr.on('end', () => this.emit('stderr', 'end'))
    this.proc.on('exit', async code => {
      if (this._pending.length > 0) await Promise.allSettled(this._pending)
      this.emit('session', 'exit', code ?? 0)
    })
    this.proc.on('error', err => this.emit('session', 'error', err))
  }

  get stdin() {
    const self = this
    return {
      write(chunk) {
        if (!self._repl) throw new Error('write() is only available in repl mode')
        if (!self.proc) throw new Error('Session not open')
        self.proc.stdin.write(chunk)
      },
      end() {
        if (!self._repl) throw new Error('write() is only available in repl mode')
        if (!self.proc) throw new Error('Session not open')
        self.proc.stdin.end()
      },
    }
  }

  write(text) {
    if (!this._repl) throw new Error('write() is only available in repl mode')
    if (!this.proc) throw new Error('Session not open')
    this.proc.stdin.write(JSON.stringify({ type: 'line', text }) + '\n')
  }

  writeEof() {
    if (!this._repl) throw new Error('write() is only available in repl mode')
    if (!this.proc) throw new Error('Session not open')
    this.proc.stdin.write(JSON.stringify({ type: 'eof', text: '' }) + '\n')
  }

  writeInterrupt() {
    if (!this._repl) throw new Error('write() is only available in repl mode')
    if (!this.proc) throw new Error('Session not open')
    this.proc.stdin.write(JSON.stringify({ type: 'interrupt', text: '' }) + '\n')
  }

  setHandler(type, event, callbackRef) {
    this.handlers.set(`${type}:${event}`, callbackRef)
  }

  emit(type, event, arg) {
    const key = `${type}:${event}`
    const h = this.handlers.get(key)
    if (!h) return
    const handleCatch = err => {
      if (err?.message !== 'Isolate is disposed') console.error('[crunes:debug] rune.spawn callback error:', err)
    }
    if (event === 'data') {
      const ab = arg.buffer.slice(arg.byteOffset, arg.byteOffset + arg.byteLength)
      const p = h.apply(undefined, [ab], { arguments: { copy: true } })
      this._pending.push(p)
      p.then(() => { const i = this._pending.indexOf(p); if (i !== -1) this._pending.splice(i, 1) }, () => {})
      p.catch(handleCatch)
    } else if (event === 'exit') {
      h.apply(undefined, [arg], { arguments: { copy: true } }).catch(handleCatch)
    } else if (event === 'error') {
      const s = arg instanceof Error ? arg.message : String(arg)
      h.apply(undefined, [s], { arguments: { copy: true } }).catch(handleCatch)
    } else {
      h.apply(undefined, [], {}).catch(handleCatch)
    }
  }

  kill(signal) {
    if (!this.proc) return
    try { this.proc.kill(signal ?? 'SIGTERM') } catch {}
  }

  terminate() {
    this.handlers.clear()
    this.kill('SIGKILL')
  }
}
