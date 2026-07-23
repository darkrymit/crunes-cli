import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

vi.mock('../../src/plugin/registry.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({ plugins: {} }),
  resolvePluginKeyScoped: vi.fn().mockReturnValue(null),
}))
vi.mock('../../src/plugin/manifest.js', () => ({
  loadPluginJson: vi.fn(),
}))

import { handler } from '../../src/docs/commands/rune.js'
import { runRuneInIsolate } from '../../src/rune/isolation/runner.js'

const RUNE = [
  'export async function args(b) {',
  '  return b',
  '    .command("bump", "Bump the version", c => c',
  '      .positional("<level>", "major | minor | patch")',
  '      .option("-a, --added <text>", "Changelog Added entry")',
  '      .command("patch", "Patch bump"))',
  '    .build()',
  '}',
  'import { rune, section } from "@utils"',
  'export async function run(args) {',
  '  return [section.create("out", { type: "markdown", content: rune.helpText(args.$command) })]',
  '}',
].join('\n')

describe('help renderer drift', () => {
  let tmp
  let runeFile

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-drift-'))
    await mkdir(join(tmp, '.crunes', 'runes'), { recursive: true })
    runeFile = join(tmp, '.crunes', 'runes', 'r.js')
    await writeFile(runeFile, RUNE)
    await writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify({ runes: { r: {} } }))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(tmp, { recursive: true, force: true })
  })

  async function hostPage(path) {
    const written = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c) => { written.push(c); return true })
    await handler({ key: 'r', path, projectRoot: tmp, configRoot: tmp })
    spy.mockRestore()
    return written.join('').trimEnd()
  }

  async function sandboxPage(argv) {
    const sections = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, argv, tmp, { runeKey: 'r', vars: {} })
    return sections.map(s => s.data?.content ?? '').join('\n').trimEnd()
  }

  it('renders a byte-identical depth-1 command page on both surfaces', async () => {
    expect(await sandboxPage(['bump', 'major'])).toBe(await hostPage(['bump']))
  })

  it('renders a byte-identical depth-2 command page on both surfaces', async () => {
    expect(await sandboxPage(['bump', 'patch'])).toBe(await hostPage(['bump', 'patch']))
  })
})
