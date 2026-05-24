import { describe, it, expect } from 'vitest'
import { createVarsUtils } from '../../../src/rune/api/vars.js'

describe('createVarsUtils', () => {
  it('read returns value when key exists', () => {
    const v = createVarsUtils({ apiBase: 'https://api.github.com' })
    expect(v.read('apiBase')).toBe('https://api.github.com')
  })

  it('read returns fallback when key missing', () => {
    const v = createVarsUtils({})
    expect(v.read('missing', 'default')).toBe('default')
  })

  it('read returns undefined when key missing and no fallback', () => {
    const v = createVarsUtils({})
    expect(v.read('missing')).toBeUndefined()
  })

  it('has returns true when key exists', () => {
    const v = createVarsUtils({ org: 'myorg' })
    expect(v.has('org')).toBe(true)
  })

  it('has returns false when key missing', () => {
    const v = createVarsUtils({})
    expect(v.has('org')).toBe(false)
  })

  it('project vars override plugin defaults when merged before createVarsUtils', () => {
    const pluginVars  = { apiBase: 'https://api.github.com', org: '' }
    const projectVars = { org: 'myorg' }
    const v = createVarsUtils({ ...pluginVars, ...projectVars })
    expect(v.read('org')).toBe('myorg')
    expect(v.read('apiBase')).toBe('https://api.github.com')
  })

  it('empty vars — read always returns fallback', () => {
    const v = createVarsUtils({})
    expect(v.read('anything', 'fallback')).toBe('fallback')
  })

  it('non-string values are returned as-is', () => {
    const v = createVarsUtils({ count: 42, flag: true, nested: { x: 1 } })
    expect(v.read('count')).toBe(42)
    expect(v.read('flag')).toBe(true)
    expect(v.read('nested')).toEqual({ x: 1 })
  })
})
