import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { appendFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tailStdin, EOF_SENTINEL } from '../../src/job/stdin-tail.js'

describe('tailStdin', () => {
  let logPath
  beforeEach(() => {
    logPath = join(tmpdir(), `crunes-test-stdin-${Date.now()}.log`)
    writeFileSync(logPath, '')
  })
  afterEach(() => {
    if (existsSync(logPath)) unlinkSync(logPath)
  })

  it('calls onLine for each line appended after start', async () => {
    const lines = []
    const { stop } = tailStdin(logPath, { onLine: l => lines.push(l), pollMs: 10 })
    await new Promise(r => setTimeout(r, 20))
    appendFileSync(logPath, 'hello\n')
    await new Promise(r => setTimeout(r, 30))
    stop()
    expect(lines).toContain('hello')
  })

  it('calls onEof and stops when EOF_SENTINEL line is appended', async () => {
    let eofCalled = false
    const { stop } = tailStdin(logPath, { onLine: () => {}, onEof: () => { eofCalled = true }, pollMs: 10 })
    await new Promise(r => setTimeout(r, 20))
    appendFileSync(logPath, EOF_SENTINEL + '\n')
    await new Promise(r => setTimeout(r, 30))
    stop()
    expect(eofCalled).toBe(true)
  })

  it('delivers lines written before start', async () => {
    appendFileSync(logPath, 'pre-written\n')
    const lines = []
    const { stop } = tailStdin(logPath, { onLine: l => lines.push(l), pollMs: 10 })
    await new Promise(r => setTimeout(r, 30))
    stop()
    expect(lines).toContain('pre-written')
  })

  it('stop() is safe to call multiple times', () => {
    const { stop } = tailStdin(logPath, { onLine: () => {}, pollMs: 10 })
    expect(() => { stop(); stop() }).not.toThrow()
  })
})
