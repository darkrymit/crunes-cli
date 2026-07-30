import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { resolveRuneFilePath } from '../../src/rune/resolver.js'

describe('resolveRuneFilePath', () => {
  it('uses an absolute entry path verbatim, ignoring the project dir', () => {
    const abs = path.resolve('/store/runes/serve.js')
    expect(resolveRuneFilePath({ path: abs }, 'serve', '/proj')).toBe(abs)
  })

  it('joins a relative entry path against the config dir for back-compat', () => {
    expect(resolveRuneFilePath({ path: 'custom/serve.js' }, 'serve', '/proj').replace(/\\/g, '/'))
      .toBe(path.join('/proj', 'custom/serve.js').replace(/\\/g, '/'))
  })

  it('falls back to the project default when no path is present', () => {
    expect(resolveRuneFilePath({}, 'serve', '/proj').replace(/\\/g, '/'))
      .toBe(path.join('/proj', '.crunes/runes/serve.js').replace(/\\/g, '/'))
  })
})
