import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

vi.mock('../../../src/plugin/registry.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({ plugins: {} }),
  resolvePluginKeyScoped: vi.fn().mockReturnValue(null),
}))
vi.mock('../../../src/plugin/manifest.js', () => ({
  loadPluginJson: vi.fn(),
}))

import { handler } from '../../../src/docs/commands/rune.js'

const RELEASE_RUNE = [
  'export async function args(b) {',
  '  return b',
  '    .option("--dry-run", "Print actions without executing")',
  '    .command("info", "Show current release context")',
  '    .command("bump", "Bump the version", c => c',
  '      .positional("<level>", "major | minor | patch")',
  '      .option("-a, --added <text>", "Changelog Added entry")',
  '      .command("patch", "Patch bump")',
  '      .command("minor", "Minor bump"))',
  '    .build()',
  '}',
  'export async function run() { return [] }',
].join('\n')

describe('docs rune handler', () => {
  let tmp
  let written

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-docs-'))
    await mkdir(join(tmp, '.crunes', 'runes'), { recursive: true })
    await writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify({
      runes: {
        release: { name: 'Release', description: 'Release automation' },
        count: { name: 'Counter', description: 'Counts things' },
      },
    }))
    await writeFile(join(tmp, '.crunes', 'runes', 'release.js'), RELEASE_RUNE)
    await writeFile(join(tmp, '.crunes', 'runes', 'count.js'), 'export async function run() { return [] }')
    written = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { written.push(chunk); return true })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(tmp, { recursive: true, force: true })
  })

  const out = () => written.join('')

  it('renders the rune index with every command as a full path', async () => {
    await handler({ key: 'release', path: [], projectRoot: tmp, configRoot: tmp })
    expect(out()).toContain('Rune: release — Release automation')
    expect(out()).toContain('  info')
    expect(out()).toContain('  bump <level>')
    expect(out()).toContain('  bump patch')
  })

  it('does not render option detail for subcommands on the index', async () => {
    await handler({ key: 'release', path: [], projectRoot: tmp, configRoot: tmp })
    expect(out()).not.toContain('-a, --added')
  })

  it('renders a depth-1 command page with that command options', async () => {
    await handler({ key: 'release', path: ['bump'], projectRoot: tmp, configRoot: tmp })
    expect(out()).toContain('Usage: crunes run release bump <level> [options]')
    expect(out()).toContain('-a, --added <text>')
  })

  it('renders a depth-2 command page', async () => {
    await handler({ key: 'release', path: ['bump', 'patch'], projectRoot: tmp, configRoot: tmp })
    expect(out()).toContain('Usage: crunes run release bump patch [options]')
  })

  it('errors with the valid children on an unknown segment and exits 1', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await handler({ key: 'release', path: ['bump', 'nope'], projectRoot: tmp, configRoot: tmp })
    const msg = errSpy.mock.calls.flat().join('\n')
    expect(msg).toContain('"nope" is not a command of rune "release"')
    expect(msg).toContain('patch, minor')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('names the multi-rune migration when the failed segment is itself a rune key', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await handler({ key: 'release', path: ['count'], projectRoot: tmp, configRoot: tmp })
    const msg = errSpy.mock.calls.flat().join('\n')
    expect(msg).toContain('"count" is a known rune')
    expect(msg).toContain('crunes docs rune')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('warns and exits 1 for an unknown rune key', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await handler({ key: 'nosuch', path: [], projectRoot: tmp, configRoot: tmp })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown rune: "nosuch"'))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('keeps the docs-subcommand tip for keys that collide with docs subcommands', async () => {
    vi.spyOn(process, 'exit').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await handler({ key: 'run', path: [], projectRoot: tmp, configRoot: tmp })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Did you mean "crunes docs run"?'))
  })

  it('json index returns command paths, not the full nested schema', async () => {
    await handler({ key: 'release', path: [], format: 'json', projectRoot: tmp, configRoot: tmp })
    const parsed = JSON.parse(out())
    expect(parsed.key).toBe('release')
    expect(parsed.commands.map(c => c.path)).toEqual(['info', 'bump', 'bump patch', 'bump minor'])
    expect(parsed.commands[1].options).toBeUndefined()
  })

  it('json command page returns that node detail and its direct children', async () => {
    await handler({ key: 'release', path: ['bump'], format: 'json', projectRoot: tmp, configRoot: tmp })
    const parsed = JSON.parse(out())
    expect(parsed.path).toBe('bump')
    expect(parsed.options[0].flags).toBe('-a, --added <text>')
    expect(parsed.commands.map(c => c.path)).toEqual(['bump patch', 'bump minor'])
  })

  it('renders an index for a rune with no args export', async () => {
    await handler({ key: 'count', path: [], projectRoot: tmp, configRoot: tmp })
    expect(out()).toContain('Rune: count — Counts things')
  })
})

describe('docs rune handler — plugin runes', () => {
  let tmp
  let written

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-docs-plugin-'))
    await mkdir(join(tmp, '.crunes'), { recursive: true })
    written = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { written.push(chunk); return true })
    vi.clearAllMocks()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(tmp, { recursive: true, force: true })
  })

  it('resolves a fully-qualified plugin:rune key and renders its index', async () => {
    const { loadRegistry, resolvePluginKeyScoped } = await import('../../../src/plugin/registry.js')
    const { loadPluginJson } = await import('../../../src/plugin/manifest.js')
    await writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify({ runes: {}, plugins: ['my-org@git'] }))
    resolvePluginKeyScoped.mockReturnValue('my-org@git')
    loadRegistry.mockResolvedValue({ plugins: { 'my-org@git': { path: '/plugins/git', cacheDir: '/plugins/git' } } })
    loadPluginJson.mockResolvedValue({
      name: 'git', version: '1.0.0',
      runes: { status: { name: 'Git Status', description: 'Shows status', permissions: {} } },
    })

    await handler({ key: 'my-org@git:status', path: [], projectRoot: tmp, configRoot: tmp })
    expect(written.join('')).toContain('Shows status')
  })

  it('an ambiguous bare rune key surfaces the resolver error instead of "Unknown rune"', async () => {
    const { loadRegistry, resolvePluginKeyScoped } = await import('../../../src/plugin/registry.js')
    const { loadPluginJson } = await import('../../../src/plugin/manifest.js')
    await writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify({
      runes: {}, plugins: ['sole-market@git', 'other-market@docker-tools'],
    }))
    resolvePluginKeyScoped.mockReturnValue(null)
    loadRegistry.mockResolvedValue({
      plugins: {
        'sole-market@git': { path: '/plugins/git', cacheDir: '/plugins/git' },
        'other-market@docker-tools': { path: '/plugins/docker', cacheDir: '/plugins/docker' },
      },
    })
    loadPluginJson.mockImplementation(async (dir) => {
      if (dir === '/plugins/git') return { name: 'git', version: '1.0.0', runes: { info: {} } }
      if (dir === '/plugins/docker') return { name: 'docker-tools', version: '1.0.0', runes: { info: {} } }
      throw new Error('unexpected dir')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})

    await handler({ key: 'info', path: [], projectRoot: tmp, configRoot: tmp })

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"info" matches runes in multiple plugins: sole-market@git, other-market@docker-tools'))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
