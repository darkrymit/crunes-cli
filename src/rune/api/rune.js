import { spawn } from 'node:child_process'

export class RuneSession {
  constructor(runeKey, args, { cliPath, projectDir }) {
    this.handlers = new Map()
    this._spawnArgs = { runeKey, args, cliPath, projectDir }
    this.proc = null
    this._pending = null
  }

  open() {
    const { runeKey, args, cliPath, projectDir } = this._spawnArgs
    this._pending = []
    this.proc = spawn(
      process.execPath,
      [cliPath, '--cwd', projectDir, 'run', runeKey, '--format', 'jsonl', ...(args ?? [])],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
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
