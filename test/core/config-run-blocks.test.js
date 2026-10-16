import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { validateConfig, validateMergedRunBlocks, absolutizeEntryPaths, mergeConfigs } from '../../src/core/config.js'

const validate = runes => () => validateConfig({ runes })

describe('validateConfig — run and args blocks', () => {
  it('accepts the shorthand, the object form, and an args module in front of a script', () => {
    expect(validate({
      a: { run: 'tools/a.py' },
      b: { run: { command: 'git', argv: ['log', '--oneline'] } },
      c: { run: 'tools/c.sh', args: '.crunes/runes/c.args.rune.js' },
      d: { run: { command: '.crunes/runes/d.rune.js', permissions: { allow: ['fs.read:src/**'] } } },
      e: { run: 'tools/e.py', args: { command: 'e.args.rune.js', permissions: { allow: ['fs.glob:x/*'] } } },
    })).not.toThrow()
  })

  it('refuses path and run together', () => {
    expect(validate({ a: { path: 'a.js', run: 'a.py' } })).toThrow('uses the old entry shape')
  })

  it('refuses plugin and run together', () => {
    expect(validate({ a: { plugin: 'm@p:r', run: 'a.py' } })).toThrow("a plugin rune's handler comes from the plugin")
  })

  it('refuses an args block without a run block once the layers are merged', () => {
    expect(validate({ a: { args: 'a.args.rune.js' } })).not.toThrow()
    expect(() => validateMergedRunBlocks({ runes: { a: { args: { command: '/p/a.args.rune.js' } } } })).toThrow('has no run block')
  })

  it('refuses entry-level permissions, pointing at the block', () => {
    expect(validate({ a: { run: 'a.rune.js', permissions: { run: { allow: [] } } } })).toThrow('uses the old entry shape')
  })

  it('refuses grants on a native handler, because nothing would enforce them', () => {
    expect(validate({ a: { run: { command: 'tools/a.py', permissions: { allow: ['fs.read:**'] } } } })).toThrow('runs natively with full access')
    expect(validate({ a: { run: { command: 'git', permissions: { allow: [] } } } })).toThrow('runs natively')
  })

  it('refuses lifecycle-scoped grants inside a block', () => {
    expect(validate({ a: { run: { command: 'a.rune.js', permissions: { run: { allow: [] } } } } })).toThrow('not scoped by lifecycle')
  })

  it('refuses unknown fields, so a typo cannot silently drop the handler', () => {
    expect(validate({ a: { run: { comand: 'a.py' } } })).toThrow('unknown field "comand"')
  })

  it('requires a non-empty string command and string argv', () => {
    expect(validate({ a: { run: { command: '' } } })).toThrow('run.command must be a non-empty string')
    expect(validate({ a: { run: '' } })).toThrow('must not be empty')
    expect(validate({ a: { run: { command: 'git', argv: ['log', 1] } } })).toThrow('argv must be an array of strings')
  })

  it('requires the args module to be an isolate module, and only in front of a native handler', () => {
    expect(validate({ a: { run: 'a.py', args: 'a.args.js' } })).toThrow('*.rune.js module')
    expect(validate({ a: { run: 'a.rune.js', args: 'a.args.rune.js' } })).toThrow('its own args export')
  })

  it('accepts a repl block naming an isolate module, and refuses one that does not', () => {
    expect(validate({ a: { run: 'a.rune.js', repl: { command: 'a.rune.js', permissions: { allow: [] } } } })).not.toThrow()
    expect(validate({ a: { run: 'a.rune.js', repl: 'tools/a.py' } })).toThrow('repl.command must be a *.rune.js module')
  })

  it('lets a plugin alias or override grant per block, but never name a command', () => {
    expect(validate({ a: { plugin: 'm@p:r', run: { permissions: { allow: [] } } } })).not.toThrow()
    expect(validate({ 'm@p:r': { repl: { permissions: { allow: [] } } } })).not.toThrow()
    expect(validate({ 'm@p:r': { repl: { command: 'x.rune.js' } } })).toThrow('may only grant permissions')
  })
})

describe('absolutizeEntryPaths — run and args blocks', () => {
  it('resolves a path command against its layer and leaves a program name for PATH', () => {
    const out = absolutizeEntryPaths({ runes: {
      a: { run: 'tools/a.py', args: 'a.args.rune.js' },
      b: { run: { command: 'git', argv: ['log'] } },
    } }, '/layer', 'project')
    expect(out.runes.a.run).toEqual({ command: resolve('/layer', 'tools/a.py') })
    expect(out.runes.a.args).toEqual({ command: resolve('/layer', 'a.args.rune.js') })
    expect(out.runes.b.run).toEqual({ command: 'git', argv: ['log'] })
  })

  it('gives a global rune no default path', () => {
    const out = absolutizeEntryPaths({ runes: { a: { run: 'git' }, b: {} } }, '/store', 'global')
    expect(out.runes.a.path).toBeUndefined()
    expect(out.runes.b.path).toBeUndefined()
  })
})

describe('mergeConfigs — run and args blocks merge key by key', () => {
  it('keeps the lower layer\'s command when a higher layer only adds grants', () => {
    const merged = mergeConfigs(
      { runes: { a: { run: { command: '/g/a.rune.js' } } } },
      { runes: { a: { run: { permissions: { allow: ['fs.read:x'] } } } } },
    )
    expect(merged.runes.a.run).toEqual({ command: '/g/a.rune.js', permissions: { allow: ['fs.read:x'] } })
  })
})

describe('run blocks across layers', () => {
  const load = (lower, upper) => {
    const merged = mergeConfigs(
      absolutizeEntryPaths({ runes: lower }, '/store', 'global'),
      absolutizeEntryPaths({ runes: upper }, '/proj', 'project'),
    )
    validateMergedRunBlocks(merged)
    return merged
  }

  it('lets a layer hold only grants for a command a lower layer declares', () => {
    expect(validate({ a: { run: { permissions: { allow: ['fs.read:x'] } } } })).not.toThrow()
    const merged = load({ a: { run: 'runes/a.rune.js' } }, { a: { run: { permissions: { allow: ['fs.read:x'] } } } })
    expect(merged.runes.a.run).toEqual({ command: resolve('/store', 'runes/a.rune.js'), permissions: { allow: ['fs.read:x'] } })
  })

  it('refuses grants a layer adds to a native command from another layer', () => {
    expect(() => load({ a: { run: 'tools/a.py' } }, { a: { run: { permissions: { allow: ['fs.read:x'] } } } }))
      .toThrow('runs natively with full access')
  })

  it('refuses a run block whose command no layer declares', () => {
    expect(() => load({}, { a: { run: { permissions: { allow: [] } } } })).toThrow('has no run block naming its command')
  })
})

describe('validateConfig — JSON args and structured output', () => {
  it('accepts an inline schema and a .json schema file in front of a script', () => {
    expect(validate({
      a: { run: 'tools/a.py', args: { positionals: [{ spec: '<m>', choices: ['x'] }] } },
      b: { run: 'tools/b.sh', args: 'tools/b.args.json' },
    })).not.toThrow()
  })

  it('checks an inline schema when the config loads, naming the field', () => {
    expect(validate({ a: { run: 'tools/a.py', args: { options: [{ flags: '--x', bogus: 1 }] } } }))
      .toThrow('runes["a"].args.options[0]: unknown field "bogus"')
  })

  it('refuses an args file that is neither a schema module nor JSON', () => {
    expect(validate({ a: { run: 'tools/a.py', args: 'tools/a.yaml' } })).toThrow('or a .json schema')
  })

  it('refuses an inline schema in front of an isolate module', () => {
    expect(validate({ a: { run: 'a.rune.js', args: { options: [] } } })).toThrow('its own args export')
  })

  it('accepts output text or sections on a native handler only', () => {
    expect(validate({ a: { run: { command: 'tools/a.py', output: 'sections' } } })).not.toThrow()
    expect(validate({ a: { run: { command: 'tools/a.py', output: 'json' } } })).toThrow('must be "text" or "sections"')
    expect(validate({ a: { run: { command: 'a.rune.js', output: 'sections' } } })).toThrow('output applies to native handlers')
  })
})

describe('run blocks across layers — args schemas', () => {
  it('resolves an args file against its layer even without a path separator', () => {
    const out = absolutizeEntryPaths({ runes: { a: { run: 'git', args: 'a.args.json' } } }, '/layer', 'project')
    expect(out.runes.a.args).toEqual({ command: resolve('/layer', 'a.args.json') })
  })

  it('lets an inline schema replace a lower layer\'s args whole, not merge into it', () => {
    const merged = mergeConfigs(
      { runes: { a: { run: { command: '/p/a.py' }, args: { command: '/p/a.args.json' } } } },
      { runes: { a: { args: { options: [{ flags: '--x' }] } } } },
    )
    expect(merged.runes.a.args).toEqual({ options: [{ flags: '--x' }] })
  })
})

describe('validateConfig — a block-less layer entry is not taken for the v1 fallback', () => {
  it('lets a local layer override vars of a rune whose script sits at .crunes/runes/<key>.js', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const base = mkdtempSync(join(tmpdir(), 'crunes-fallback-'))
    mkdirSync(join(base, '.crunes', 'runes'), { recursive: true })
    writeFileSync(join(base, '.crunes', 'runes', 'lint.js'), 'console.log(1)\n')
    expect(() => validateConfig({ runes: { lint: { vars: { strict: true } } } }, 'config.local.json', { base, layer: 'local' })).not.toThrow()
  })
})

describe('validateConfig — run.pass', () => {
  it('accepts raw or mapped in front of a native handler with a schema', () => {
    expect(validate({ a: { run: { command: 'git', pass: 'mapped' }, args: { options: [] } } })).not.toThrow()
    expect(validate({ a: { run: { command: 'git', pass: 'raw' } } })).not.toThrow()
  })

  it('refuses other values, an isolate module, and mapped without a schema', () => {
    expect(validate({ a: { run: { command: 'git', pass: 'strict' } } })).toThrow('must be "raw" or "mapped"')
    expect(validate({ a: { run: { command: 'a.rune.js', pass: 'mapped' } } })).toThrow('pass applies to native handlers')
    expect(() => validateMergedRunBlocks({ runes: { a: { run: { command: 'git', pass: 'mapped' } } } })).toThrow('has no args block')
  })
})

describe('validateConfig — run.timeout', () => {
  it('takes a positive number of seconds, for a script or an isolate module', () => {
    expect(validate({ a: { run: { command: 'tools/a.sh', timeout: 90 } }, b: { run: { command: 'b.rune.js', timeout: 0.5 } } })).not.toThrow()
  })

  it('refuses anything else', () => {
    for (const timeout of [0, -1, '90s', null]) {
      expect(validate({ a: { run: { command: 'tools/a.sh', timeout } } })).toThrow('run.timeout must be a number of seconds')
    }
  })
})
