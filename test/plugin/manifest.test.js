import { describe, it, expect } from 'vitest'
import { validatePluginJson } from '../../src/plugin/manifest.js'

const VALID = {
  format: '1',
  name: 'my-plugin',
  version: '1.0.0',
  runes: {
    example: { permissions: { use: { allow: ['fs.read:**'], deny: [] } } },
  },
}

describe('validatePluginJson', () => {
  it('passes a valid plugin.json', () => {
    expect(() => validatePluginJson(VALID)).not.toThrow()
  })

  it('throws when format is not "1"', () => {
    expect(() => validatePluginJson({ ...VALID, format: '2' }))
      .toThrow('unsupported format')
  })

  it('throws when name is missing', () => {
    const { name: _, ...rest } = VALID
    expect(() => validatePluginJson(rest)).toThrow('"name" is required')
  })

  it('throws when name is not a string', () => {
    expect(() => validatePluginJson({ ...VALID, name: 42 })).toThrow('"name" is required')
  })

  it('throws when version is missing', () => {
    const { version: _, ...rest } = VALID
    expect(() => validatePluginJson(rest)).toThrow('"version" is required')
  })

  it('throws when runes is missing', () => {
    const { runes: _, ...rest } = VALID
    expect(() => validatePluginJson(rest)).toThrow('"runes" must be an object')
  })

  it('throws when a rune has no permissions', () => {
    const json = {
      ...VALID,
      runes: { example: {} },
    }
    expect(() => validatePluginJson(json)).toThrow('lifecycle-scoped permissions')
  })

  it('throws when permissions has no lifecycle with an allow array', () => {
    const json = {
      ...VALID,
      runes: { example: { permissions: { use: { deny: [] } } } },
    }
    expect(() => validatePluginJson(json)).toThrow('lifecycle-scoped permissions')
  })

  it('passes when runes object is empty', () => {
    expect(() => validatePluginJson({ ...VALID, runes: {} })).not.toThrow()
  })

  it('passes multiple runes each with lifecycle-scoped permissions', () => {
    const json = {
      ...VALID,
      runes: {
        a: { permissions: { use: { allow: [], deny: [] } } },
        b: { permissions: { use: { allow: ['shell:**'], deny: [] } } },
      },
    }
    expect(() => validatePluginJson(json)).not.toThrow()
  })
})
