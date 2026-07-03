import { describe, it, expect } from 'vitest'
import { resolvePluginKeyScoped } from '../../src/plugin/registry.js'

const registry = {
  plugins: {
    'crunes-plugins@git': { path: '/a' },
    'my-org@git': { path: '/b' },
    'other@docker': { path: '/c' },
  }
}

describe('resolvePluginKeyScoped', () => {
  it('returns the key unchanged when already fully qualified', () => {
    expect(resolvePluginKeyScoped('my-org@git', registry, [])).toBe('my-org@git')
  })

  it('resolves silently when exactly one scoped match is enabled', () => {
    expect(resolvePluginKeyScoped('git', registry, ['my-org@git'])).toBe('my-org@git')
  })

  it('resolves silently even though a same-named plugin exists globally but is not enabled here', () => {
    expect(resolvePluginKeyScoped('git', registry, ['my-org@git'])).toBe('my-org@git')
    // crunes-plugins@git exists in the registry but is NOT in enabledPlugins — must not affect resolution
  })

  it('throws ambiguous with full keys when 2+ scoped matches are enabled', () => {
    expect(() => resolvePluginKeyScoped('git', registry, ['my-org@git', 'crunes-plugins@git']))
      .toThrow('Ambiguous plugin "git". Use the full key: crunes-plugins@git, my-org@git')
  })

  it('throws a "not enabled" error naming the real candidate when 0 scoped matches exist but 1+ global matches do', () => {
    expect(() => resolvePluginKeyScoped('git', registry, []))
      .toThrow('Plugin "git" is not enabled in this project (installed as crunes-plugins@git, my-org@git). Run: crunes plugin enable <one of the above>')
  })

  it('returns null when there are zero matches anywhere', () => {
    expect(resolvePluginKeyScoped('nonexistent', registry, [])).toBeNull()
  })
})
