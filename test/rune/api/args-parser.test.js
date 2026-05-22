import { describe, it, expect } from 'vitest'
import { parseFlags, buildYargsConfig, parseArgs, formatHelp } from '../../../src/rune/api/args-parser.js'

describe('parseFlags', () => {
  it('parses long-only boolean flag', () => {
    expect(parseFlags('--strict')).toEqual({ key: 'strict', alias: undefined, type: 'boolean' })
  })
  it('parses short+long number flag', () => {
    expect(parseFlags('-c, --count <number>')).toEqual({ key: 'count', alias: 'c', type: 'number' })
  })
  it('parses short+long string flag', () => {
    expect(parseFlags('-n, --name <string>')).toEqual({ key: 'name', alias: 'n', type: 'string' })
  })
  it('treats non-number angle-bracket type as string', () => {
    expect(parseFlags('-f, --file <path>')).toEqual({ key: 'file', alias: 'f', type: 'string' })
  })
  it('parses short+long with no angle brackets as boolean', () => {
    expect(parseFlags('-v, --verbose')).toEqual({ key: 'verbose', alias: 'v', type: 'boolean' })
  })
  it('throws on unrecognisable flag spec', () => {
    expect(() => parseFlags('notaflag')).toThrow('invalid flag spec "notaflag"')
  })
})

describe('buildYargsConfig', () => {
  it('returns empty object for null schema', () => {
    expect(buildYargsConfig(null)).toEqual({})
  })
  it('registers boolean option with default', () => {
    const schema = { options: [{ flags: '--strict', description: 'Strict', def: false }], positionals: [] }
    const cfg = buildYargsConfig(schema)
    expect(cfg.boolean).toContain('strict')
    expect(cfg.default.strict).toBe(false)
  })
  it('registers aliased number option', () => {
    const schema = { options: [{ flags: '-c, --count <number>', description: 'Count', def: 10 }], positionals: [] }
    const cfg = buildYargsConfig(schema)
    expect(cfg.number).toContain('count')
    expect(cfg.alias.c).toBe('count')
    expect(cfg.default.count).toBe(10)
  })
  it('registers string option without alias', () => {
    const schema = { options: [{ flags: '--name <string>', description: 'Name', def: '' }], positionals: [] }
    const cfg = buildYargsConfig(schema)
    expect(cfg.string).toContain('name')
  })
  it('omits key from defaults when def is undefined', () => {
    const schema = { options: [{ flags: '--strict', description: 'Strict' }], positionals: [] }
    const cfg = buildYargsConfig(schema)
    expect(Object.keys(cfg.default ?? {})).not.toContain('strict')
  })
})

describe('parseArgs', () => {
  it('attaches $raw to result', () => {
    const raw = ['hello']
    const result = parseArgs(raw, null)
    expect(result.$raw).toBe(raw)
  })
  it('puts positionals in result._ for null schema', () => {
    const result = parseArgs(['hello', 'world'], null)
    expect(result._).toContain('hello')
    expect(result._).toContain('world')
  })
  it('coerces number flag from schema', () => {
    const schema = { options: [{ flags: '-c, --count <number>', description: 'Count', def: 0 }], positionals: [] }
    const result = parseArgs(['-c', '7'], schema)
    expect(result.count).toBe(7)
    expect(result.$raw).toEqual(['-c', '7'])
  })
  it('applies defaults from schema', () => {
    const schema = { options: [{ flags: '--strict', description: 'Strict', def: false }], positionals: [] }
    const result = parseArgs([], schema)
    expect(result.strict).toBe(false)
  })
})

describe('formatHelp', () => {
  it('includes usage line with rune key', () => {
    const out = formatHelp(null, { key: 'myrune' })
    expect(out).toContain('crunes use myrune')
  })
  it('includes option flags and description', () => {
    const schema = { options: [{ flags: '-c, --count <number>', description: 'Max results', def: 10 }], positionals: [] }
    const out = formatHelp(schema, { key: 'myrune' })
    expect(out).toContain('-c, --count <number>')
    expect(out).toContain('Max results')
    expect(out).toContain('10')
  })
  it('includes positional spec and description', () => {
    const schema = { options: [], positionals: [{ spec: '<target>', description: 'The target' }] }
    const out = formatHelp(schema, { key: 'myrune' })
    expect(out).toContain('<target>')
    expect(out).toContain('The target')
  })
  it('shows description when schema is null', () => {
    const out = formatHelp(null, { key: 'myrune', description: 'Does stuff' })
    expect(out).toContain('Does stuff')
  })
  it('renders Examples block with usage and description', () => {
    const schema = { options: [], positionals: [], examples: [{ usage: 'crunes use myrune foo', description: 'Basic use' }] }
    const out = formatHelp(schema, { key: 'myrune' })
    expect(out).toContain('Examples:')
    expect(out).toContain('crunes use myrune foo')
    expect(out).toContain('Basic use')
  })
  it('renders example without description', () => {
    const schema = { options: [], positionals: [], examples: [{ usage: 'crunes use myrune foo' }] }
    const out = formatHelp(schema, { key: 'myrune' })
    expect(out).toContain('crunes use myrune foo')
  })
  it('omits Examples block when no examples', () => {
    const schema = { options: [], positionals: [], examples: [] }
    const out = formatHelp(schema, { key: 'myrune' })
    expect(out).not.toContain('Examples:')
  })
})
