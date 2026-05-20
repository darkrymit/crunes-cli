import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { getPluginRunePath } from '../../../src/rune/isolation/runner.js'

describe('getPluginRunePath', () => {
  it('uses convention runes/<key>.js when plugin.json has no path', () => {
    const pluginJson = { runes: { hello: { permissions: { use: { allow: [] } } } } }
    expect(getPluginRunePath('/plugin', 'hello', pluginJson))
      .toBe(join('/plugin', 'runes/hello.js'))
  })

  it('uses custom path when rune entry declares path', () => {
    const pluginJson = { runes: { hello: { path: 'lib/runes/hello.js', permissions: { use: { allow: [] } } } } }
    expect(getPluginRunePath('/plugin', 'hello', pluginJson))
      .toBe(join('/plugin', 'lib/runes/hello.js'))
  })

  it('handles missing rune entry gracefully (falls back to convention)', () => {
    const pluginJson = { runes: {} }
    expect(getPluginRunePath('/plugin', 'hello', pluginJson))
      .toBe(join('/plugin', 'runes/hello.js'))
  })
})
