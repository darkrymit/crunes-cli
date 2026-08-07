import { describe, it, expect } from 'vitest'
import { explain } from '../../../src/rune/commands/shell-explain.js'

describe('explain', () => {
  it('lists every command position with its builtin status', () => {
    const r = explain({ cmd: 'echo hi | grep x' })
    expect(r.refusal).toBe(null)
    expect(r.commands).toEqual([
      { program: 'echo', segment: 'echo hi',  offset: 0,  builtin: true },
      { program: 'grep', segment: 'grep x',   offset: 10, builtin: false },
    ])
  })

  it('lists redirect targets with the capability each is checked against', () => {
    const r = explain({ cmd: 'cat < in.txt > out.txt' })
    expect(r.redirects).toEqual([
      { capability: 'fs.read',  target: 'in.txt',  offset: 6 },
      { capability: 'fs.write', target: 'out.txt', offset: 15 },
    ])
  })

  it('reports a refusal instead of throwing', () => {
    const r = explain({ cmd: 'eval "$X"' })
    expect(r.refusal).toEqual({ construct: 'eval', offset: 0 })
    expect(r.commands).toEqual([])
  })

  it('reports the shell the command would run under', () => {
    expect(['bash', 'sh', 'cmd']).toContain(explain({ cmd: 'git status' }).shell)
  })
})
