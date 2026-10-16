import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isInlineSchema, normaliseJsonSchema, loadJsonSchema, validateParsed } from '../../../src/rune/native/schema.js'
import { parseArgs } from '../../../src/rune/api/args-parser.js'

describe('normaliseJsonSchema — the JSON args format', () => {
  it('converts to the shape the parser and help renderer read, with default held in def', () => {
    expect(normaliseJsonSchema({
      positionals: [{ spec: '<module>', description: 'Module', choices: ['auth'] }],
      options: [{ flags: '--min <percent>', description: 'Min', default: '0', required: true, choices: ['0', '80'] }],
      examples: [{ usage: 'crunes run cov auth', description: 'Auth' }],
      commands: [{ name: 'diff', description: 'Diff', options: [{ flags: '--base <ref>' }] }],
    })).toEqual({
      positionals: [{ spec: '<module>', description: 'Module', choices: ['auth'] }],
      options: [{ flags: '--min <percent>', description: 'Min', def: '0', required: true, choices: ['0', '80'] }],
      examples: [{ usage: 'crunes run cov auth', description: 'Auth' }],
      commands: [{ name: 'diff', description: 'Diff', positionals: [], options: [{ flags: '--base <ref>', description: '' }], examples: [], commands: [] }],
    })
  })

  it('names the path to an unknown field', () => {
    expect(() => normaliseJsonSchema({ options: [{ flags: '--x', defualt: 1 }] }, 'args')).toThrow('args.options[0]: unknown field "defualt"')
    expect(() => normaliseJsonSchema({ commands: [{ name: 'a', opts: [] }] }, 'args')).toThrow('args.commands[0]: unknown field "opts"')
  })

  it('refuses malformed specs, flags, choices and required', () => {
    expect(() => normaliseJsonSchema({ positionals: [{ spec: 'module' }] })).toThrow('"spec" must look like')
    expect(() => normaliseJsonSchema({ options: [{ flags: '-n <count>' }] })).toThrow('invalid flag spec')
    expect(() => normaliseJsonSchema({ options: [{ flags: '--x', choices: [] }] })).toThrow('non-empty array')
    expect(() => normaliseJsonSchema({ options: [{ flags: '--x', required: 'yes' }] })).toThrow('"required" must be true or false')
  })

  it('tells an inline schema from an args block', () => {
    expect(isInlineSchema({ options: [] })).toBe(true)
    expect(isInlineSchema({ command: 'a.rune.js' })).toBe(false)
    expect(isInlineSchema('a.json')).toBe(false)
  })

  it('reads a .json file and names it in errors', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crunes-schema-'))
    writeFileSync(join(dir, 'ok.json'), '{ "positionals": [{ "spec": "<a>" }] }')
    writeFileSync(join(dir, 'bad.json'), '{ nope')
    expect(loadJsonSchema(join(dir, 'ok.json')).positionals[0].spec).toBe('<a>')
    expect(() => loadJsonSchema(join(dir, 'bad.json'), 'tools/bad.json')).toThrow('tools/bad.json: invalid JSON')
    expect(() => loadJsonSchema(join(dir, 'gone.json'), 'tools/gone.json')).toThrow('tools/gone.json: file not found')
  })
})

describe('validateParsed — what a schema declares is enforced', () => {
  const schema = normaliseJsonSchema({
    positionals: [{ spec: '<module>', choices: ['auth', 'billing'] }, { spec: '[extra...]' }],
    options: [{ flags: '--level <n>', choices: [1, 2] }, { flags: '--token <t>', required: true }],
    commands: [{ name: 'diff', positionals: [{ spec: '<base>' }] }],
  })
  const check = argv => () => validateParsed(schema, parseArgs(argv, schema), 'cov')

  it('accepts a call that meets the schema, comparing choices as strings', () => {
    expect(check(['auth', '--level', '2', '--token', 't'])).not.toThrow()
  })

  it('reports every problem at once, with how to see the usage', () => {
    expect(check(['payments', '--level', '3'])).toThrow(
      /<module> must be one of "auth", "billing" — got "payments"[\s\S]*--level <n> must be one of 1, 2 — got "3"[\s\S]*missing required option --token <t>[\s\S]*crunes run cov --help/
    )
  })

  it('requires a <positional> but not an [optional] one', () => {
    expect(check(['--token', 't'])).toThrow('missing required <module>')
  })

  it('checks the positionals of the command the call landed on', () => {
    expect(check(['diff', '--token', 't'])).toThrow(/missing required <base>[\s\S]*crunes run cov diff --help/)
    expect(check(['diff', 'main', '--token', 't'])).not.toThrow()
  })
})
