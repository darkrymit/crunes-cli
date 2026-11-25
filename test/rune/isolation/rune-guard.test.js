import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runRuneInIsolate } from '../../../src/rune/isolation/runner.js'

const EMPTY_PERMS = { allow: [], deny: [] }

let dir
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'crunes-rune-guard-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function writeAndRun(code, args = [], runeKey = 'myplugin:demo') {
  const file = join(dir, 'index.rune.js')
  await writeFile(file, code, 'utf8')
  return runRuneInIsolate(file, EMPTY_PERMS, args, dir, { runeKey })
}

const MULTI_CMD_RUNE = `
import { rune, section } from '@utils'

export function args(b) {
  return b
    .option('-h, --help', 'Show help')
    .option('--dry-run', 'Preview without side effects', false)
    .command('list', 'List items', c => {
      c.option('-n, --limit <number>', 'Max items', '10')
    })
    .command('get', 'Get item by id', c => {
      c.positional('<id>', 'Item id')
    })
}

export async function run(args) {
  const stop = rune.guard(args)
  if (stop) return stop
  return section.create('executed', { type: 'markdown', content: 'EXECUTED:' + args.$command })
}
`

describe('rune.guard & composable arg guards', () => {
  it('returns subcommand help on `list --help` without executing the command', async () => {
    const res = await writeAndRun(MULTI_CMD_RUNE, ['list', '--help'])
    expect(res.name).toBe('help')
    expect(res.data.content).toContain('list')
    expect(res.data.content).not.toContain('EXECUTED')
  })

  it('reports unknown root command with fuzzy suggestions using rune.key() prefix, even when --help is passed', async () => {
    const res = await writeAndRun(MULTI_CMD_RUNE, ['lst', '--help'], 'local:demo')
    expect(res.name).toBe('demo-error')
    expect(res.data.content).toContain('[Unknown command]')
    expect(res.data.content).toContain('local:demo list')
  })

  it('rejects unknown options before executing', async () => {
    const res = await writeAndRun(MULTI_CMD_RUNE, ['list', '--bogus'])
    expect(res.name).toBe('demo-error')
    expect(res.data.content).toContain('[Unknown option]')
    expect(res.data.content).toContain('--bogus')
  })

  it('allows kebab-case options declared in args()', async () => {
    const res = await writeAndRun(MULTI_CMD_RUNE, ['list', '--dry-run', '--limit', '5'])
    expect(res.name).toBe('executed')
    expect(res.data.content).toBe('EXECUTED:list')
  })

  it('returns scoped help when a required <positional> is missing', async () => {
    const res = await writeAndRun(MULTI_CMD_RUNE, ['get'])
    expect(res.name).toBe('help')
    expect(res.data.content).toContain('get')
  })

  it('allows toggling individual checks off (e.g. unknownOptions: false)', async () => {
    const code = `
import { rune, section } from '@utils'
export function args(b) {
  return b.option('-h, --help', 'Show help').command('run', 'Run it')
}
export async function run(args) {
  const stop = rune.guard(args, { unknownOptions: false })
  if (stop) return stop
  return section.create('ok', { type: 'markdown', content: 'PASSED:' + String(args.extra) })
}
`
    const res = await writeAndRun(code, ['run', '--extra'])
    expect(res.name).toBe('ok')
    expect(res.data.content).toBe('PASSED:true')
  })
})
