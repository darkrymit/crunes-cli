import { describe, it, expect } from 'vitest'
import { permissionHint } from '../../../src/rune/commands/denial-hint.js'

const CTX = { key: 'inventory', configLayers: 'project config (/p/.crunes)' }

describe('permissionHint', () => {
  it('returns null for a message that is not a denial', () => {
    expect(permissionHint('TypeError: md.list is not a function', CTX)).toBeNull()
  })

  it('names the config path for the denied grant', () => {
    const out = permissionHint("'fs.read:package.json' is not permitted.", CTX)
    expect(out).toContain('"runes": { "inventory": { "permissions": { "run": { "allow": ["fs.read:package.json"] } } } }')
    expect(out).toContain('project config (/p/.crunes)')
  })

  it('uses the lifecycle it was given', () => {
    const out = permissionHint("'fs.read:x' is not permitted.", { ...CTX, lifecycle: 'repl' })
    expect(out).toContain('"permissions": { "repl": { "allow": ["fs.read:x"] } }')
    expect(out).toContain('neither inherits from the other')
  })

  it('points shell denials at shell explain', () => {
    const out = permissionHint("'shell.run:git log' is not permitted.", CTX)
    expect(out).toContain('crunes shell explain')
  })

  it('warns that fs.glob grants are matched exactly', () => {
    const out = permissionHint("'fs.glob:./**/*.js' is not permitted.", CTX)
    expect(out).toContain('match the pattern string exactly')
    expect(out).toContain('"allow": ["fs.glob:./**/*.js"]')
  })

  it('does not offer a grant for an unscannable command', () => {
    const out = permissionHint("Cannot scan command: 'eval' at offset 0 is not supported.", CTX)
    expect(out).toContain('No grant overrides this')
    expect(out).not.toContain('"allow"')
  })

  it('keeps a value containing a colon intact', () => {
    const out = permissionHint("'http.fetch:GET::**/q/health' is not permitted.", CTX)
    expect(out).toContain('"allow": ["http.fetch:GET::**/q/health"]')
  })
})
