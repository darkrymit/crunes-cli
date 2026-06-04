import { describe, it, expect, vi } from 'vitest'
import { RuneSession } from '../../../src/rune/api/rune.js'

describe('RuneSession', () => {
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
})
