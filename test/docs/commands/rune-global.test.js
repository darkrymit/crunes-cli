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

describe('docs rune global index', () => {
  let tmp
  let written

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-docsg-'))
    await mkdir(join(tmp, '.crunes', 'runes'), { recursive: true })
    await writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify({
      runes: {
        release: { name: 'Release', description: 'Release automation' },
        count: { name: 'Counter', description: 'Counts things' },
      },
    }))
    await writeFile(join(tmp, '.crunes', 'runes', 'release.js'), [
      'export async function args(b) {',
      '  return b.command("info", "Show context").command("git", "Stage and tag").build()',
      '}',
      'export async function run() { return [] }',
    ].join('\n'))
    await writeFile(join(tmp, '.crunes', 'runes', 'count.js'), 'export async function run() { return [] }')
    written = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { written.push(chunk); return true })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(tmp, { recursive: true, force: true })
  })

  const out = () => written.join('')

  it('lists every rune with its command tree', async () => {
    await handler({ key: undefined, path: [], projectRoot: tmp, configRoot: tmp })
    expect(out()).toContain('release — Release automation')
    expect(out()).toContain('  info')
    expect(out()).toContain('  git')
    expect(out()).toContain('count — Counts things')
  })

  it('renders the drill-down footer', async () => {
    await handler({ key: undefined, path: [], projectRoot: tmp, configRoot: tmp })
    expect(out()).toContain('Drill down: crunes docs rune <key> [command path...]')
  })

  it('lists healthy runes and exits 1 when one rune schema fails to build', async () => {
    await writeFile(join(tmp, '.crunes', 'runes', 'broken.js'), 'export async function args() { throw new Error("boom") }')
    await writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify({
      runes: {
        release: { name: 'Release', description: 'Release automation' },
        broken: { name: 'Broken', description: 'Explodes' },
      },
    }))
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await handler({ key: undefined, path: [], projectRoot: tmp, configRoot: tmp })
    expect(out()).toContain('release — Release automation')
    expect(out()).toContain('⚠ broken — could not build args schema')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('json global index is an array of per-rune entries with command paths', async () => {
    await handler({ key: undefined, path: [], format: 'json', projectRoot: tmp, configRoot: tmp })
    const parsed = JSON.parse(out())
    const release = parsed.find(e => e.key === 'release')
    expect(release.commands.map(c => c.path)).toEqual(['info', 'git'])
  })

  it('renders the empty state when no runes are configured', async () => {
    await writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify({ runes: {} }))
    await handler({ key: undefined, path: [], projectRoot: tmp, configRoot: tmp })
    expect(out()).toContain('No runes configured.')
  })
})
