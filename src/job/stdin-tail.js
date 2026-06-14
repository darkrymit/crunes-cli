import { readSync, openSync, closeSync, statSync } from 'node:fs'

export const EOF_SENTINEL = '__CRUNES_STDIN_EOF__'

/**
 * Tails a stdin.log file and calls onLine for each new line.
 * Calls onEof and stops when EOF_SENTINEL is received.
 * Returns { stop } to cancel tailing.
 */
export function tailStdin(logPath, { onLine, onEof = () => {}, pollMs = 50 } = {}) {
  let offset = 0
  let stopped = false
  let timer = null
  let remainder = ''

  function read() {
    if (stopped) return
    let fd
    try {
      fd = openSync(logPath, 'r')
      const size = statSync(logPath).size
      if (size <= offset) { schedule(); return }
      const buf = Buffer.allocUnsafe(size - offset)
      const bytesRead = readSync(fd, buf, 0, buf.length, offset)
      offset += bytesRead
      remainder += buf.slice(0, bytesRead).toString('utf8')
    } catch {
      schedule(); return
    } finally {
      try { if (fd !== undefined) closeSync(fd) } catch {}
    }

    const lines = remainder.split('\n')
    remainder = lines.pop() // keep incomplete last chunk
    for (const line of lines) {
      if (line === EOF_SENTINEL) {
        stopped = true
        onEof()
        return
      }
      if (line.length > 0) onLine(line)
    }
    schedule()
  }

  function schedule() {
    if (!stopped) timer = setTimeout(read, pollMs)
  }

  function stop() {
    stopped = true
    if (timer) { clearTimeout(timer); timer = null }
  }

  schedule()
  return { stop }
}
