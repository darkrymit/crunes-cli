import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handler } from '../../../src/rune/commands/list.js'
import { loadConfig } from '../../../src/core/config.js'

vi.mock('../../../src/core/config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../../src/plugin/registry.js', () => ({
  loadRegistry: vi.fn(() => ({
    plugins: {
      'mkt@plug': { path: '/plugins/plug', cacheDir: '/plugins/plug' }
    }
  }))
}))
vi.mock('../../../src/plugin/manifest.js', () => ({
  loadPluginJson: vi.fn(() => ({
    runes: {
      'custom-rune': { name: 'Custom Rune', description: 'Plugin Rune' }
    }
  }))
}))

describe('crunes list — unified listing', () => {
  let stdoutWritten = ''
  beforeEach(() => {
    stdoutWritten = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { stdoutWritten += s })
    vi.spyOn(process, 'exit').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists both local runes and enabled plugin runes', async () => {
    loadConfig.mockReturnValue({
      runes: {
        'local-rune': { path: 'runes/local.js', name: 'Local Rune', description: 'Local' }
      },
      plugins: ['mkt@plug']
    })

    await handler({ format: 'json', plain: false, projectRoot: '/p', configRoot: '/p' })

    const entries = JSON.parse(stdoutWritten.trim())
    expect(entries).toHaveLength(2)
    expect(entries[0].key).toBe('local-rune')
    expect(entries[1].key).toBe('plug:custom-rune')
    expect(entries[1].description).toBe('Plugin Rune')
  })
})
