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

describe('disable handler — scoped resolution, no global registry lookup', () => {
  it('resolves a bare name using only config.plugins, ignoring a same-named globally-installed-but-not-enabled plugin', async () => {
    const tmp1 = await mkdtemp(join(tmpdir(), 'crunes-disable-scoped-'))
    await mkdir(join(tmp1, '.crunes'), { recursive: true })
    await writeFile(
      join(tmp1, '.crunes', 'config.json'),
      JSON.stringify({ plugins: ['my-org@git'] }, null, 2)
    )

    // loadRegistry mock (from the outer beforeEach) would normally report crunes-plugins@git too,
    // but disable must not need to consult it at all — this succeeds using only config.plugins.
    await disableHandler({ name: 'git', projectRoot: tmp1, configRoot: tmp1 })

    const written = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(join(tmp1, '.crunes', 'config.json'), 'utf8')))
    expect(written.plugins).not.toContain('my-org@git')

    await rm(tmp1, { recursive: true, force: true })
  })

  it('throws ambiguous with full keys when config.plugins itself has two matches', async () => {
    const tmp2 = await mkdtemp(join(tmpdir(), 'crunes-disable-ambiguous-'))
    await mkdir(join(tmp2, '.crunes'), { recursive: true })
    await writeFile(
      join(tmp2, '.crunes', 'config.json'),
      JSON.stringify({ plugins: ['my-org@git', 'crunes-plugins@git'] }, null, 2)
    )
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await disableHandler({ name: 'git', projectRoot: tmp2, configRoot: tmp2 })

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Ambiguous plugin "git". Use the full key: my-org@git, crunes-plugins@git'))
    expect(exitSpy).toHaveBeenCalledWith(1)

    exitSpy.mockRestore()
    errorSpy.mockRestore()
    await rm(tmp2, { recursive: true, force: true })
  })
})
