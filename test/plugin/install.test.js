import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs/promises'

vi.mock('node:fs/promises')
vi.mock('../../src/plugin/registry.js', () => ({
  loadRegistry: vi.fn(),
  removePlugin:  vi.fn(),
}))
vi.mock('../../src/core/config.js', () => ({ loadConfig: vi.fn() }))

import { uninstallPlugin, classifySource } from '../../src/plugin/install.js'
import { loadRegistry, removePlugin } from '../../src/plugin/registry.js'

beforeEach(() => {
  vi.clearAllMocks()
  removePlugin.mockResolvedValue()
})

describe('uninstallPlugin', () => {
  it('deletes the cache directory for a remote plugin', async () => {
    loadRegistry.mockResolvedValue({
      plugins: { 'mkt@plug': { path: '/store/cache/plug', local: false } },
    })
    fs.lstat.mockResolvedValue({ isSymbolicLink: () => false })
    fs.rm.mockResolvedValue()

    await uninstallPlugin('mkt@plug', null)

    expect(fs.rm).toHaveBeenCalledWith('/store/cache/plug', { recursive: true, force: true })
  })

  it('does NOT delete the source directory for a local plugin', async () => {
    loadRegistry.mockResolvedValue({
      plugins: { 'mkt@plug': { path: '/projects/my-plugin', local: true } },
    })
    fs.rm.mockResolvedValue()

    await uninstallPlugin('mkt@plug', null)

    expect(fs.rm).not.toHaveBeenCalled()
    expect(fs.lstat).not.toHaveBeenCalled()
  })

  it('throws when the plugin is not installed', async () => {
    loadRegistry.mockResolvedValue({ plugins: {} })

    await expect(uninstallPlugin('mkt@missing', null))
      .rejects.toThrow('not installed')
  })
})

describe('classifySource', () => {
  it('parses github:owner/repo#subpath into github type and subpath', () => {
    expect(classifySource('github:darkrymit/crunes-plugins#plugins/token')).toEqual({
      type: 'github',
      resolved: 'https://github.com/darkrymit/crunes-plugins',
      subpath: 'plugins/token',
    })
  })

  it('parses bare owner/repo without subpath', () => {
    expect(classifySource('darkrymit/crunes-plugins')).toEqual({
      type: 'github',
      resolved: 'https://github.com/darkrymit/crunes-plugins',
    })
  })
})
