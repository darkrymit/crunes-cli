import { describe, it, expect } from 'vitest'
import { parseReplReturn, parseSlashCommand, BUILTIN_SLASH_COMMANDS } from '../../../src/rune/commands/run-repl.js'

describe('parseReplReturn', () => {
  it('undefined → continue with no prompt change', () => {
    expect(parseReplReturn(undefined)).toEqual({ type: 'continue', prompt: null })
  })

  it('string → continue with custom prompt', () => {
    expect(parseReplReturn('select> ')).toEqual({ type: 'continue', prompt: 'select> ' })
  })

  it('{ type: "prompt", value } → continue with value as prompt', () => {
    expect(parseReplReturn({ type: 'prompt', value: 'name> ' })).toEqual({ type: 'continue', prompt: 'name> ' })
  })

  it('{ type: "prompt" } with no value → continue with null prompt', () => {
    expect(parseReplReturn({ type: 'prompt' })).toEqual({ type: 'continue', prompt: null })
  })

  it('{ type: "done" } → done with no message', () => {
    expect(parseReplReturn({ type: 'done' })).toEqual({ type: 'done', message: null })
  })

  it('{ type: "done", message } → done with message', () => {
    expect(parseReplReturn({ type: 'done', message: 'bye!' })).toEqual({ type: 'done', message: 'bye!' })
  })

  it('unknown object → continue with no prompt', () => {
    expect(parseReplReturn({ foo: 'bar' })).toEqual({ type: 'continue', prompt: null })
  })
})

describe('parseSlashCommand', () => {
  it('returns null for non-slash input', () => {
    expect(parseSlashCommand('SELECT 1')).toBeNull()
    expect(parseSlashCommand('')).toBeNull()
    expect(parseSlashCommand('  ')).toBeNull()
  })

  it('returns command name and rest for slash input', () => {
    expect(parseSlashCommand('/help')).toEqual({ name: 'help', rest: '' })
    expect(parseSlashCommand('/schema books')).toEqual({ name: 'schema', rest: 'books' })
    expect(parseSlashCommand('/exit ')).toEqual({ name: 'exit', rest: '' })
  })
})

describe('BUILTIN_SLASH_COMMANDS', () => {
  it('contains help, clear, exit', () => {
    const names = BUILTIN_SLASH_COMMANDS.map(c => c.name)
    expect(names).toContain('help')
    expect(names).toContain('clear')
    expect(names).toContain('exit')
  })
})
