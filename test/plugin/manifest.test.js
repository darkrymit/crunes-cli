import { describe, it, expect, vi } from 'vitest'
import { validatePluginJson } from '../../src/plugin/manifest.js'

const VALID = {
  format: '1',
  name: 'my-plugin',
  version: '1.0.0',
  runes: {
    example: { permissions: { run: { allow: ['fs.read:**'], deny: [] } } },
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



  it('throws when runes is missing', () => {
    const { runes: _, ...rest } = VALID
    expect(() => validatePluginJson(rest)).toThrow('"runes" must be an object')
  })

  it('passes when a rune has no permissions block', () => {
    const json = {
      ...VALID,
      runes: { example: {} },
    }
    expect(() => validatePluginJson(json)).not.toThrow()
  })

  it('throws when permissions has no lifecycle with an allow array', () => {
    const json = {
      ...VALID,
      runes: { example: { permissions: { run: { deny: [] } } } },
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
        a: { permissions: { run: { allow: [], deny: [] } } },
        b: { permissions: { run: { allow: ['shell:**'], deny: [] } } },
      },
    }
    expect(() => validatePluginJson(json)).not.toThrow()
  })

  it('passes when permissions block is omitted', () => {
    const json = {
      ...VALID,
      runes: { example: { name: 'Zero Perm' } },
    }
    expect(() => validatePluginJson(json)).not.toThrow()
  })

  it('passes when permissions block is empty', () => {
    const json = {
      ...VALID,
      runes: { example: { name: 'Zero Perm', permissions: {} } },
    }
    expect(() => validatePluginJson(json)).not.toThrow()
  })

  it('throws error if plugin rune permissions contain flat allowance arrays', () => {
    const bad = {
      format: '1',
      runes: {
        myrune: { permissions: { allow: ['fs.read:*'] } }
      }
    }
    expect(() => validatePluginJson(bad)).toThrow()
  })

  it('passes and warns if plugin rune permissions.run is empty', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const json = {
      format: '1',
      runes: {
        myrune: { permissions: { run: {} } }
      }
    }
    expect(() => validatePluginJson(json)).not.toThrow()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
