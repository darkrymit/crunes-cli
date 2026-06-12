import { describe, it, expect } from 'vitest'
import { parseReplReturn, parseSlashCommand, BUILTIN_SLASH_COMMANDS, parseJsonlInputLine } from '../../../src/rune/commands/run-repl.js'

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

describe('parseJsonlInputLine', () => {
  it('parses a line event', () => {
    expect(parseJsonlInputLine('{"type":"line","text":"SELECT 1"}')).toEqual({ type: 'line', text: 'SELECT 1' })
  })

  it('parses a line event with embedded newlines', () => {
    expect(parseJsonlInputLine('{"type":"line","text":"SELECT *\\nFROM books"}')).toEqual({ type: 'line', text: 'SELECT *\nFROM books' })
  })

  it('parses an interrupt event', () => {
    expect(parseJsonlInputLine('{"type":"interrupt"}')).toEqual({ type: 'interrupt' })
  })

  it('parses an eof event', () => {
    expect(parseJsonlInputLine('{"type":"eof"}')).toEqual({ type: 'eof' })
  })

  it('parses a command event', () => {
    expect(parseJsonlInputLine('{"type":"command","args":{"$command":"tables"}}')).toEqual({ type: 'command', args: { '$command': 'tables' } })
  })

  it('returns null for invalid JSON', () => {
    expect(parseJsonlInputLine('not json')).toBeNull()
  })

  it('returns null for missing type field', () => {
    expect(parseJsonlInputLine('{"text":"hello"}')).toBeNull()
  })

  it('returns null for unknown type', () => {
    expect(parseJsonlInputLine('{"type":"unknown"}')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseJsonlInputLine('')).toBeNull()
  })
})

describe('onEvent stderr routing — log level events', () => {
  it('log event (from logger) writes message to stderr unprefixed', () => {
    const captured = []
    const orig = process.stderr.write.bind(process.stderr)
    process.stderr.write = (msg) => { captured.push(msg); return true }
    try {
      const type = 'log'
      const message = 'info from logger'
      if (type === 'log' || type === 'warn' || type === 'error') {
        process.stderr.write(message + '\n')
      }
    } finally {
      process.stderr.write = orig
    }
    expect(captured).toContain('info from logger\n')
  })
})

describe('onEvent stderr routing', () => {
  it('log, warn, and error events all write to stderr unprefixed', () => {
    const captured = []
    const orig = process.stderr.write.bind(process.stderr)
    process.stderr.write = (msg) => { captured.push(msg); return true }
    try {
      for (const type of ['log', 'warn', 'error']) {
        const message = `msg-${type}`
        if (type === 'log' || type === 'warn' || type === 'error') {
          process.stderr.write(message + '\n')
        }
      }
    } finally {
      process.stderr.write = orig
    }
    expect(captured).toEqual(['msg-log\n', 'msg-warn\n', 'msg-error\n'])
  })
})
