import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('../../../src/plugin/registry.js', () => ({
  loadRegistry: vi.fn(),
  resolvePluginKey: vi.fn(),
}))

import { loadRegistry, resolvePluginKey } from '../../../src/plugin/registry.js'
import { handler as enableHandler } from '../../../src/plugin/commands/enable.js'
import { handler as disableHandler } from '../../../src/plugin/commands/disable.js'

let projectRoot, configRoot

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'crunes-enable-proj-'))
  configRoot  = await mkdtemp(join(tmpdir(), 'crunes-enable-cfg-'))
  await mkdir(join(configRoot, '.crunes'), { recursive: true })
  await writeFile(
    join(configRoot, '.crunes', 'config.json'),
    JSON.stringify({ plugins: ['official@git'] }, null, 2)
  )
  vi.mocked(loadRegistry).mockResolvedValue({ plugins: { 'official@git': { path: '/fake' } } })
  vi.mocked(resolvePluginKey).mockReturnValue('official@myplugin')
})

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true })
  await rm(configRoot,  { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('enable handler — configRoot', () => {
  it('writes enabled plugin to configRoot/.crunes/config.json, not projectRoot', async () => {
    await enableHandler({ name: 'myplugin', projectRoot, configRoot })

    const written = JSON.parse(
      await import('node:fs/promises').then(fs => fs.readFile(join(configRoot, '.crunes', 'config.json'), 'utf8'))
    )
    expect(written.plugins).toContain('official@myplugin')

    // projectRoot/.crunes must NOT have been created
    await expect(
      import('node:fs/promises').then(fs => fs.access(join(projectRoot, '.crunes', 'config.json')))
    ).rejects.toThrow()
  })
})

describe('disable handler — configRoot', () => {
  it('writes disabled plugin to configRoot/.crunes/config.json, not projectRoot', async () => {
    // Pre-seed configRoot with a plugin to disable
    await writeFile(
      join(configRoot, '.crunes', 'config.json'),
      JSON.stringify({ plugins: ['official@git', 'official@myplugin'] }, null, 2)
    )

    await disableHandler({ name: 'myplugin', projectRoot, configRoot })

    const written = JSON.parse(
      await import('node:fs/promises').then(fs => fs.readFile(join(configRoot, '.crunes', 'config.json'), 'utf8'))
    )
    expect(written.plugins).not.toContain('official@myplugin')

    await expect(
      import('node:fs/promises').then(fs => fs.access(join(projectRoot, '.crunes', 'config.json')))
    ).rejects.toThrow()
  })
})
