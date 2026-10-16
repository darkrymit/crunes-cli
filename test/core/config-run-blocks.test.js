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
    expect(validate({ a: { path: 'a.js', run: 'a.py' } })).toThrow('both "path" and "run"')
  })

  it('refuses plugin and run together', () => {
    expect(validate({ a: { plugin: 'm@p:r', run: 'a.py' } })).toThrow('both "plugin" and "run"')
  })

  it('refuses an args block without a run block once the layers are merged', () => {
    expect(validate({ a: { args: 'a.args.rune.js' } })).not.toThrow()
    expect(() => validateMergedRunBlocks({ runes: { a: { args: { command: '/p/a.args.rune.js' } } } })).toThrow('no "run" block')
  })

  it('refuses entry-level permissions, pointing at the block', () => {
    expect(validate({ a: { run: 'a.rune.js', permissions: { run: { allow: [] } } } })).toThrow('put grants in run.permissions')
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

  it('leaves path entries to their existing rules', () => {
    expect(validate({ a: { path: 'a.js', permissions: { run: { allow: [] } } } })).not.toThrow()
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

  it('gives a global run-block rune no default path', () => {
    const out = absolutizeEntryPaths({ runes: { a: { run: 'git' }, b: {} } }, '/store', 'global')
    expect(out.runes.a.path).toBeUndefined()
    expect(out.runes.b.path).toBe(resolve('/store', 'runes/b.js'))
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
    expect(() => load({}, { a: { run: { permissions: { allow: [] } } } })).toThrow('no command in any config layer')
  })

  it('refuses a path from one layer combined with a run block from another', () => {
    expect(() => load({ a: { path: 'runes/a.js' } }, { a: { run: 'tools/a.py' } })).toThrow('both "path" and "run"')
  })
})
