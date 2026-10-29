import { describe, it, expect } from 'vitest'
import { validatePluginJson } from '../../src/plugin/manifest.js'

const VALID = {
  format: '1',
  name: 'my-plugin',
  version: '1.0.0',
  runes: {
    example: { run: { command: 'runes/example.rune.js', permissions: { allow: ['fs.read:**'], deny: [] } } },
  },
}

describe('validatePluginJson — format 1', () => {
  it('passes a valid plugin.json', () => {
    expect(() => validatePluginJson(VALID)).not.toThrow()
  })

  it('accepts a run block written as a string, and a repl block', () => {
    const json = { ...VALID, runes: { a: { run: 'runes/a.rune.js', repl: { command: 'runes/a.rune.js', permissions: { allow: [] } } } } }
    expect(() => validatePluginJson(json)).not.toThrow()
  })

  it('passes when runes object is empty', () => {
    expect(() => validatePluginJson({ ...VALID, runes: {} })).not.toThrow()
  })

  it('throws on an unknown format', () => {
    expect(() => validatePluginJson({ ...VALID, format: '2' })).toThrow('unsupported format "2"')
  })

  it('throws when runes is missing', () => {
    const { runes: _, ...rest } = VALID
    expect(() => validatePluginJson(rest)).toThrow('"runes" must be an object')
  })

  it('requires a run block', () => {
    expect(() => validatePluginJson({ ...VALID, runes: { a: {} } })).toThrow('rune "a" has no run block')
  })

  it('accepts a native rune — a script or program — with argv, a schema, output, pass and timeout', () => {
    const json = { ...VALID, runes: {
      a: { run: { command: 'scripts/a.py', argv: ['--x'], output: 'sections', timeout: 60 }, args: { positionals: [{ spec: '<m>' }] } },
      b: { run: { command: 'kubectl', argv: ['get'], pass: 'mapped' }, args: 'schemas/b.json' },
    } }
    expect(() => validatePluginJson(json)).not.toThrow()
  })

  it('refuses grants on a native rune, a native REPL, and native-only fields on an isolate module', () => {
    expect(() => validatePluginJson({ ...VALID, runes: { a: { run: { command: 'a.sh', permissions: { allow: [] } } } } })).toThrow('runs natively with full access')
    expect(() => validatePluginJson({ ...VALID, runes: { a: { run: 'a.rune.js', repl: 'a.sh' } } })).toThrow('repl.command must be a *.rune.js module')
    expect(() => validatePluginJson({ ...VALID, runes: { a: { run: { command: 'a.rune.js', argv: ['x'] } } } })).toThrow('apply to a native handler')
    expect(() => validatePluginJson({ ...VALID, runes: { a: { run: 'a.rune.js', args: { options: [] } } } })).toThrow('declares its schema with its own args export')
  })

  it('refuses the old fields and mode-scoped grants inside a block', () => {
    expect(() => validatePluginJson({ ...VALID, runes: { a: { run: 'runes/a.rune.js', path: 'runes/a.js' } } })).toThrow('has "path"')
    expect(() => validatePluginJson({ ...VALID, runes: { a: { run: { command: 'runes/a.rune.js', permissions: { run: { allow: [] } } } } } }))
      .toThrow('run.permissions must be { "allow": [...], "deny": [...] }')
  })
})
