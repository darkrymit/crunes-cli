import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/plugin/registry.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({ plugins: {} }),
}))
vi.mock('../../src/plugin/manifest.js', () => ({
  loadPluginJson: vi.fn(),
}))

import { enumerateRunes } from '../../src/rune/enumerate.js'
import { loadRegistry } from '../../src/plugin/registry.js'
import { loadPluginJson } from '../../src/plugin/manifest.js'

describe('enumerateRunes', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns local config runes with their path as source', async () => {
    const config = { runes: { greet: { path: '.crunes/runes/greet.js', name: 'Greeter', description: 'Says hello' } } }
    const out = await enumerateRunes(config)
    expect(out).toEqual([{ key: 'greet', source: '.crunes/runes/greet.js', name: 'Greeter', description: 'Says hello' }])
  })

  it('returns an empty array when there are no runes and no plugins', async () => {
    expect(await enumerateRunes({})).toEqual([])
  })

  it('appends enabled-plugin runes with a short-name prefixed key', async () => {
    loadRegistry.mockResolvedValue({ plugins: { 'scope@git': { path: '/p/git' } } })
    loadPluginJson.mockResolvedValue({ runes: { status: { name: 'Status', description: 'Git status' } } })
    const out = await enumerateRunes({ runes: {}, plugins: ['scope@git'] })
    expect(out).toEqual([{ key: 'git:status', source: 'plugin: scope@git', name: 'Status', description: 'Git status' }])
  })

  it('does not overwrite a local rune that shares a plugin display key', async () => {
    loadRegistry.mockResolvedValue({ plugins: { 'scope@git': { path: '/p/git' } } })
    loadPluginJson.mockResolvedValue({ runes: { status: { name: 'Plugin version' } } })
    const config = { runes: { 'git:status': { path: 'local.js', name: 'Local version' } }, plugins: ['scope@git'] }
    const out = await enumerateRunes(config)
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Local version')
  })

  it('skips a plugin whose manifest cannot be loaded', async () => {
    loadRegistry.mockResolvedValue({ plugins: { 'scope@git': { path: '/p/git' } } })
    loadPluginJson.mockRejectedValue(new Error('bad manifest'))
    expect(await enumerateRunes({ runes: {}, plugins: ['scope@git'] })).toEqual([])
  })

  it('swallows a registry failure and returns local runes only', async () => {
    loadRegistry.mockRejectedValue(new Error('no registry'))
    const config = { runes: { greet: { path: 'g.js' } }, plugins: ['scope@git'] }
    const out = await enumerateRunes(config)
    expect(out.map(e => e.key)).toEqual(['greet'])
  })
})
