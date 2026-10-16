import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { validatePluginJson } from '../../src/plugin/manifest.js'

const VALID = {
  format: '2',
  name: 'my-plugin',
  version: '1.0.0',
  runes: {
    example: { run: { command: 'runes/example.rune.js', permissions: { allow: ['fs.read:**'], deny: [] } } },
  },
}

describe('validatePluginJson — format 2', () => {
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
    expect(() => validatePluginJson({ ...VALID, format: '3' })).toThrow('unsupported format "3"')
  })

  it('throws when runes is missing', () => {
    const { runes: _, ...rest } = VALID
    expect(() => validatePluginJson(rest)).toThrow('"runes" must be an object')
  })

  it('requires a run block naming an isolate module', () => {
    expect(() => validatePluginJson({ ...VALID, runes: { a: {} } })).toThrow('rune "a" has no run block')
    expect(() => validatePluginJson({ ...VALID, runes: { a: { run: 'runes/a.js' } } })).toThrow('run.command must be a *.rune.js module')
  })

  it('refuses the format 1 fields and mode-scoped grants inside a block', () => {
    expect(() => validatePluginJson({ ...VALID, runes: { a: { run: 'runes/a.rune.js', path: 'runes/a.js' } } })).toThrow('has "path"')
    expect(() => validatePluginJson({ ...VALID, runes: { a: { run: { command: 'runes/a.rune.js', permissions: { run: { allow: [] } } } } } }))
      .toThrow('run.permissions must be { "allow": [...], "deny": [...] }')
  })
})

describe('validatePluginJson — format 1 is refused with its rewrite', () => {
  it('names the migration and shows a rune rewritten', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crunes-manifest-'))
    mkdirSync(join(dir, 'runes'))
    writeFileSync(join(dir, 'runes', 'hello.js'), 'export function run() {}\nexport function repl() {}\n')
    let message = ''
    try {
      validatePluginJson({ format: '1', runes: { hello: { permissions: { run: { allow: ['fs.read:**'] } } } } }, dir)
    } catch (err) { message = err.message }
    expect(message).toContain('manifest format "1" is no longer read')
    expect(message).toContain('"command": "runes/hello.rune.js"')
    expect(message).toContain('"repl": "runes/hello.rune.js"')
    expect(message).toContain('crunes migrate --plugin')
  })
})
