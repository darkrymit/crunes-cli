import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs/promises'

vi.mock('node:fs/promises')
vi.mock('../../src/plugin/registry.js', () => ({
  loadRegistry: vi.fn(),
  removePlugin:  vi.fn(),
}))
vi.mock('../../src/core/config.js', () => ({ loadConfig: vi.fn() }))

import { uninstallPlugin } from '../../src/plugin/install.js'
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
