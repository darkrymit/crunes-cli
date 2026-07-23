import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { runRuneInIsolate } from '../../../src/rune/isolation/runner.js'

const RUNE = [
  'export async function args(b) {',
  '  return b',
  '    .option("-h, --help", "Show help")',
  '    .option("--mode <mode>", "Test hook")',
  '    .command("bump", "Bump the version", c => c',
  '      .positional("<level>", "major | minor | patch")',
  '      .option("-a, --added <text>", "Changelog Added entry")',
  '      .command("patch", "Patch bump"))',
  '    .build()',
  '}',
  'import { rune, section } from "@utils"',
  'export async function run(args) {',
  '  if (args.mode === "throw") {',
  '    try { rune.helpText("nope") } catch (e) { return [section.create("err", { type: "markdown", content: e.message })] }',
  '  }',
  '  return [section.create("out", { type: "markdown", content: rune.helpText(args.$command) })]',
  '}',
].join('\n')

describe('utils.rune.helpText — scoped rendering', () => {
  let tmp
  let runeFile

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-runehelp-'))
    await mkdir(join(tmp, '.crunes', 'runes'), { recursive: true })
    runeFile = join(tmp, '.crunes', 'runes', 'r.js')
    await writeFile(runeFile, RUNE)
  })

  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  // Signature is runRuneInIsolate(runeFile, effective, args, projectDir, opts)
  // and it returns whatever run() returned — here, the sections array.
  const run = async (argv) => {
    const sections = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, argv, tmp, { runeKey: 'r', vars: {} })
    return sections.map(s => s.data?.content ?? '').join('\n')
  }

  it('renders the rune index when no path is given', async () => {
    const out = await run([])
    expect(out).toContain('Rune: r')
    expect(out).toContain('  bump <level>')
    expect(out).toContain('  bump patch')
  })

  it('omits the batch section from the sandbox index', async () => {
    expect(await run([])).not.toContain('Batch:')
  })

  it('renders only the matched subcommand page at depth 1', async () => {
    const out = await run(['bump', 'major'])
    expect(out).toContain('Usage: crunes run r bump <level> [options]')
    expect(out).toContain('-a, --added <text>')
    expect(out).not.toContain('Rune: r')
  })

  it('renders the matched subcommand page at depth 2', async () => {
    const out = await run(['bump', 'patch'])
    expect(out).toContain('Usage: crunes run r bump patch [options]')
  })

  it('throws with the valid children for an unresolvable path', async () => {
    const out = await run(['--mode', 'throw'])
    expect(out).toContain('"nope" is not a command')
    expect(out).toContain('bump')
  })
})
