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

describe('parseArgs — values are not coerced to numbers unless declared', () => {
  it('keeps positionals and undeclared options as typed', () => {
    const result = parseArgs(['1.10', '007', '--tag', '1.20'], { positionals: [{ spec: '<version>' }, { spec: '<id>' }] })
    expect(result.version).toBe('1.10')
    expect(result.id).toBe('007')
    expect(result.tag).toBe('1.20')
  })

  it('keeps values as typed without a schema', () => {
    expect(parseArgs(['1.10', '--n', '05'], null)).toMatchObject({ _: ['1.10'], n: '05' })
  })

  it('still coerces an option whose placeholder is <number>', () => {
    expect(parseArgs(['--limit', '5'], { options: [{ flags: '--limit <number>' }] }).limit).toBe(5)
  })
})
