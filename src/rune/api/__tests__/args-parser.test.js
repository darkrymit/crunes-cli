import { describe, it, expect } from 'vitest'
import { parseArgs } from '../args-parser.js'

describe('parseArgs — $command and $commands at root', () => {
  it('sets $command to empty string when no subcommand is matched', () => {
    const schema = {
      commands: [{ name: 'sub', positionals: [], options: [] }],
      options: [],
      positionals: []
    }
    const result = parseArgs([], schema)
    expect(result.$command).toBe('')
  })

  it('sets $commands to empty array when no subcommand is matched', () => {
    const schema = {
      commands: [{ name: 'sub', positionals: [], options: [] }],
      options: [],
      positionals: []
    }
    const result = parseArgs([], schema)
    expect(result.$commands).toEqual([])
  })

  it('still sets $command correctly when a subcommand is matched', () => {
    const schema = {
      commands: [{ name: 'sub', positionals: [], options: [] }],
      options: [],
      positionals: []
    }
    const result = parseArgs(['sub'], schema)
    expect(result.$command).toBe('sub')
    expect(result.$commands).toEqual(['sub'])
  })
})
