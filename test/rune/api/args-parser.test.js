import { describe, it, expect } from 'vitest'
import { parseFlags, buildYargsConfig, parseArgs } from '../../../src/rune/api/args-parser.js'

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

describe('sandbox builder', () => {
  it('builds recursive command schemas', () => {
    // Mocking isolate builder structure locally
    const opts = [], pos = [], exs = [], cmds = []
    const createBuilder = (subName, subDesc) => {
      const sOpts = [], sPos = [], sExs = [], sCmds = []
      const subBuilder = {
        option(flags, description, def) { sOpts.push({ flags, description, def }); return subBuilder },
        positional(spec, description)   { sPos.push({ spec, description }); return subBuilder },
        example(usage, description)     { sExs.push({ usage, description }); return subBuilder },
        command(name, description, callback) {
          const nestedBuilder = createBuilder(name, description)
          if (typeof callback === 'function') callback(nestedBuilder)
          sCmds.push(nestedBuilder.build())
          return subBuilder
        },
        build() { return { name: subName, description: subDesc, options: sOpts, positionals: sPos, examples: sExs, commands: sCmds } }
      }
      return subBuilder
    }
    const b = {
      option(flags, description, def) { opts.push({ flags, description, def }); return b },
      positional(spec, description)   { pos.push({ spec, description }); return b },
      example(usage, description)     { exs.push({ usage, description }); return b },
      command(name, description, callback) {
        const subBuilder = createBuilder(name, description)
        if (typeof callback === 'function') callback(subBuilder)
        cmds.push(subBuilder.build())
        return b
      },
      build() { return { options: opts, positionals: pos, examples: exs, commands: cmds } }
    }

    b.command('remote', 'Git remotes', remote => {
      remote.command('add', 'Add remote', add => {
        add.positional('<name>', 'Name').option('--fetch', 'Fetch', false)
      })
    })

    const schema = b.build()
    expect(schema.commands[0].name).toBe('remote')
    expect(schema.commands[0].commands[0].name).toBe('add')
    expect(schema.commands[0].commands[0].positionals[0].spec).toBe('<name>')
  })
})

describe('parseArgs nested commands', () => {
  const schema = {
    options: [{ flags: '--verbose', description: 'Verbose', def: false }],
    positionals: [],
    commands: [
      {
        name: 'remote',
        description: 'Remote commands',
        options: [{ flags: '--fetch', description: 'Fetch option', def: true }],
        commands: [
          {
            name: 'add',
            description: 'Add remote',
            options: [{ flags: '--force', description: 'Force overwrite', def: false }],
            positionals: [{ spec: '<name>', description: 'Remote name' }, { spec: '<url>', description: 'URL' }]
          }
        ]
      }
    ]
  }

  it('resolves intermediate command paths', () => {
    const parsed = parseArgs(['remote'], schema)
    expect(parsed.$command).toBe('remote')
    expect(parsed.$commands).toEqual(['remote'])
    expect(parsed.fetch).toBe(true)
  })

  it('resolves deeply nested commands and merges options', () => {
    const parsed = parseArgs(['--verbose', 'remote', 'add', 'origin', 'https://github.com', '--force'], schema)
    expect(parsed.$command).toBe('remote add')
    expect(parsed.$commands).toEqual(['remote', 'add'])
    expect(parsed.verbose).toBe(true)
    expect(parsed.fetch).toBe(true)
    expect(parsed.force).toBe(true)
  })

  it('maps positionals to named properties', () => {
    const parsed = parseArgs(['remote', 'add', 'origin', 'https://github.com'], schema)
    expect(parsed.name).toBe('origin')
    expect(parsed.url).toBe('https://github.com')
  })

  it('args._ contains only data positionals, not command tokens', () => {
    const parsed = parseArgs(['remote', 'add', 'origin', 'https://github.com'], schema)
    expect(parsed._).toEqual(['origin', 'https://github.com'])
  })

  it('args._ is empty when no data positionals provided', () => {
    const parsed = parseArgs(['remote', 'add'], schema)
    expect(parsed._).toEqual([])
  })

  it('sets $command to empty string and $commands to empty array when no subcommand matched', () => {
    const schemaNoCmd = { options: [], positionals: [] }
    const parsed = parseArgs(['hello'], schemaNoCmd)
    expect(parsed.$command).toBe('')
    expect(parsed.$commands).toEqual([])
  })

  it('does not expose legacy command/commands/subcommand/subcommands keys', () => {
    const parsed = parseArgs(['remote', 'add', 'origin', 'https://github.com'], schema)
    expect(parsed.command).toBeUndefined()
    expect(parsed.commands).toBeUndefined()
    expect(parsed.subcommand).toBeUndefined()
    expect(parsed.subcommands).toBeUndefined()
  })

  it('maps variadic positionals to named array properties', () => {
    const customSchema = {
      options: [],
      positionals: [],
      commands: [
        {
          name: 'audit',
          description: 'Audit files',
          positionals: [{ spec: '<targets...>', description: 'Files to audit' }]
        }
      ]
    }
    const parsed = parseArgs(['audit', 'file1.txt', 'file2.txt'], customSchema)
    expect(parsed.$command).toBe('audit')
    expect(parsed.targets).toEqual(['file1.txt', 'file2.txt'])
    expect(parsed.$rest).toEqual([])
  })

  it('populates $rest with unmapped positional arguments', () => {
    const customSchema = {
      options: [],
      positionals: [{ spec: '<first>', description: 'First arg' }],
    }
    const parsed = parseArgs(['alice', 'bob', 'charlie'], customSchema)
    expect(parsed.first).toBe('alice')
    expect(parsed.$rest).toEqual(['bob', 'charlie'])
  })

  it('populates $rest with all positionals when no positional schema exists', () => {
    const customSchema = { options: [], positionals: [] }
    const parsed = parseArgs(['hello', 'world'], customSchema)
    expect(parsed.$rest).toEqual(['hello', 'world'])
  })

  it('sets empty array for $rest when all positionals are mapped', () => {
    const customSchema = {
      options: [],
      positionals: [{ spec: '<first>', description: 'First' }, { spec: '<second>', description: 'Second' }],
    }
    const parsed = parseArgs(['hello', 'world'], customSchema)
    expect(parsed.first).toBe('hello')
    expect(parsed.second).toBe('world')
    expect(parsed.$rest).toEqual([])
  })
})
