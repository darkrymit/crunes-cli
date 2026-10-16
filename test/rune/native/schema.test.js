import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isInlineSchema, normaliseJsonSchema, loadJsonSchema, validateParsed, mapToArgv, undeclaredArgs } from '../../../src/rune/native/schema.js'
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

describe('value types', () => {
  const schema = normaliseJsonSchema({
    positionals: [{ spec: '<version>' }, { spec: '[count]', type: 'integer' }],
    options: [{ flags: '--ratio <r>', type: 'number' }, { flags: '--id <id>' }],
  })
  const parse = argv => parseArgs(argv, schema)

  it('keeps untyped values exactly as typed', () => {
    const parsed = parse(['1.10', '--id', '007'])
    expect(parsed.version).toBe('1.10')
    expect(parsed.id).toBe('007')
  })

  it('coerces declared numbers and reports values that are not', () => {
    expect(parse(['1.0', '3', '--ratio', '0.5'])).toMatchObject({ count: 3, ratio: 0.5 })
    expect(() => validateParsed(schema, parse(['1.0', 'x', '--ratio', 'y']), 'rel')).toThrow(
      /\[count\] must be an integer — got "x"\n  --ratio <r> must be a number/
    )
    expect(() => validateParsed(schema, parse(['1.0', '2.5']), 'rel')).toThrow('[count] must be an integer — got "2.5"')
  })

  it('refuses a type that does not fit the flag', () => {
    expect(() => normaliseJsonSchema({ options: [{ flags: '--dry', type: 'number' }] })).toThrow('"boolean" for a flag that takes no value')
    expect(() => normaliseJsonSchema({ options: [{ flags: '--n <n>', type: 'boolean' }] })).toThrow('for an option that takes a value')
    expect(() => normaliseJsonSchema({ positionals: [{ spec: '<a>', type: 'date' }] })).toThrow('"type" must be one of string, number, integer')
  })
})

describe('mapToArgv — a schema rewritten into the program\'s own arguments', () => {
  const schema = normaliseJsonSchema({
    positionals: [{ spec: '[path]', to: ['--', '{value}'] }],
    options: [
      { flags: '--limit <n>', type: 'integer', default: 20, to: ['-n', '{value}'] },
      { flags: '--since <date>', to: '--since={value}' },
      { flags: '--graph', to: '--graph' },
      { flags: '-a, --all' },
      { flags: '--author <who>' },
    ],
  })
  const map = argv => mapToArgv(schema, parseArgs(argv, schema))

  it('maps options in declaration order, then positionals, filling {value}', () => {
    expect(map(['src', '--since', '2 weeks ago', '--graph'])).toEqual(['-n', '20', '--since=2 weeks ago', '--graph', '--', 'src'])
  })

  it('passes an option without `to` as its own flag, and leaves out what is unset or false', () => {
    expect(map(['-a', '--author', 'kim', '--limit', '5'])).toEqual(['-n', '5', '--all', '--author', 'kim'])
    expect(map(['--no-graph'])).toEqual(['-n', '20'])
  })

  it('maps a matched command to its `to` tokens, or its name', () => {
    const s = normaliseJsonSchema({ commands: [{ name: 'recent', to: ['log', '--oneline'], options: [{ flags: '--max <n>', to: '-n{value}' }] }, { name: 'show' }] })
    expect(mapToArgv(s, parseArgs(['recent', '--max', '3'], s))).toEqual(['log', '--oneline', '-n3'])
    expect(mapToArgv(s, parseArgs(['show'], s))).toEqual(['show'])
  })

  it('refuses a `to` that is not a string or strings', () => {
    expect(() => normaliseJsonSchema({ options: [{ flags: '--x', to: 3 }] })).toThrow('"to" must be a string or an array of strings')
  })
})

describe('undeclaredArgs — what a mapped rune will not pass on', () => {
  const schema = normaliseJsonSchema({
    positionals: [{ spec: '[path]' }],
    options: [{ flags: '-v, --verbose' }, { flags: '-n, --limit <n>' }],
  })
  const check = argv => undeclaredArgs(schema, parseArgs(argv, schema), argv)

  it('accepts declared long and short flags, clusters, values and --help', () => {
    expect(check(['src', '-v', '--limit=3', '-vn5', '--no-verbose', '--help'])).toEqual([])
  })

  it('names unknown options and extra positionals', () => {
    expect(check(['src', 'more', '--force', '-x'])).toEqual(['unknown option --force', 'unknown option -x', 'unexpected argument "more"'])
  })
})
