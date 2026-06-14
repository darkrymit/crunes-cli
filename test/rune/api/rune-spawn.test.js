import { describe, it, expect, vi } from 'vitest'
import { RuneSession } from '../../../src/rune/api/rune.js'

describe('RuneSession — non-repl (default)', () => {
  it('does not spawn before open() is called', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake' })
    expect(session.proc).toBeNull()
  })

  it('setHandler stores handler before open()', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake' })
    const ref = { apply: vi.fn() }
    session.setHandler('stdout', 'data', ref)
    expect(session.handlers.get('stdout:data')).toBe(ref)
  })

  it('kill() is a no-op before open()', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake' })
    expect(() => session.kill()).not.toThrow()
  })

  it('terminate() is a no-op before open()', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake' })
    expect(() => session.terminate()).not.toThrow()
  })

  it('write() throws when not in repl mode', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake' })
    expect(() => session.write('hello')).toThrow('write() is only available in repl mode')
  })

  it('writeEof() throws when not in repl mode', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake' })
    expect(() => session.writeEof()).toThrow('write() is only available in repl mode')
  })

  it('writeInterrupt() throws when not in repl mode', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake' })
    expect(() => session.writeInterrupt()).toThrow('write() is only available in repl mode')
  })
})

describe('RuneSession — repl mode', () => {
  it('repl flag is stored', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake', repl: true })
    expect(session._repl).toBe(true)
  })

  it('write() throws when session not open yet', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake', repl: true })
    expect(() => session.write('hello')).toThrow('Session not open')
  })

  it('writeEof() throws when session not open yet', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake', repl: true })
    expect(() => session.writeEof()).toThrow('Session not open')
  })

  it('writeInterrupt() throws when session not open yet', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake', repl: true })
    expect(() => session.writeInterrupt()).toThrow('Session not open')
  })

  it('write() sends correct JSONL line when proc.stdin is mocked', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake', repl: true })
    const written = []
    session.proc = { stdin: { write: (s) => written.push(s) } }
    session.write('hello world')
    expect(written).toEqual([JSON.stringify({ type: 'line', text: 'hello world' }) + '\n'])
  })

  it('writeEof() sends correct JSONL line when proc.stdin is mocked', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake', repl: true })
    const written = []
    session.proc = { stdin: { write: (s) => written.push(s), end: vi.fn() } }
    session.writeEof()
    expect(written).toEqual([JSON.stringify({ type: 'eof', text: '' }) + '\n'])
  })

  it('writeInterrupt() sends correct JSONL line when proc.stdin is mocked', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake', repl: true })
    const written = []
    session.proc = { stdin: { write: (s) => written.push(s) } }
    session.writeInterrupt()
    expect(written).toEqual([JSON.stringify({ type: 'interrupt', text: '' }) + '\n'])
  })

  it('stdin.write() delegates to proc.stdin.write', () => {
    const session = new RuneSession('greet', [], { cliPath: '/fake/cli.js', projectDir: '/fake', repl: true })
    const written = []
    session.proc = { stdin: { write: (s) => written.push(s) } }
    session.stdin.write('{"type":"line","text":"raw"}\n')
    expect(written).toEqual(['{"type":"line","text":"raw"}\n'])
  })
})
