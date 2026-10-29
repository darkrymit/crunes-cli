import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { handler } from '../../../src/cli/commands/migrate.js'
import { loadConfig } from '../../../src/core/config.js'
import { validatePluginJson } from '../../../src/plugin/manifest.js'

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crunes-migrate-'))
  mkdirSync(join(dir, '.crunes', 'runes'), { recursive: true })
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const runes = (...names) => names.forEach(n => writeFileSync(join(dir, '.crunes', 'runes', n), 'export function run() {}\n'))

describe('crunes migrate — a project', () => {
  it('rewrites path, the fallback file, scoped grants and an implicit REPL, and renames the modules', async () => {
    runes('a.js', 'b.js')
    writeFileSync(join(dir, '.crunes', 'runes', 'shell.js'), 'export async function run() {}\nexport async function repl() {}\n')
    writeFileSync(join(dir, '.crunes', 'config.json'), JSON.stringify({ runes: {
      a: { path: '.crunes/runes/a.js', description: 'A', permissions: { run: { allow: ['fs.read:**'] } } },
      b: {},
      shell: { permissions: { repl: { allow: ['shell:ls'] } } },
      log: { run: { command: 'git', argv: ['log'] } },
      alias: { plugin: 'mp@p:r', permissions: { run: { allow: ['fs.read:x'] } } },
    } }))
    writeFileSync(join(dir, '.crunes', 'config.local.json'), JSON.stringify({ runes: { a: { vars: { x: 1 } } } }))

    await handler({ configRoot: dir })

    const config = readJson(join(dir, '.crunes', 'config.json'))
    expect(config.runes).toEqual({
      a: { description: 'A', run: { command: '.crunes/runes/a.rune.js', permissions: { allow: ['fs.read:**'] } } },
      b: { run: '.crunes/runes/b.rune.js' },
      shell: { run: '.crunes/runes/shell.rune.js', repl: { command: '.crunes/runes/shell.rune.js', permissions: { allow: ['shell:ls'] } } },
      log: { run: { command: 'git', argv: ['log'] } },
      alias: { plugin: 'mp@p:r', run: { permissions: { allow: ['fs.read:x'] } } },
    })
    // A layer that only overrides vars is not given a command of its own.
    expect(readJson(join(dir, '.crunes', 'config.local.json'))).toEqual({ runes: { a: { vars: { x: 1 } } } })
    for (const n of ['a', 'b', 'shell']) {
      expect(existsSync(join(dir, '.crunes', 'runes', `${n}.rune.js`))).toBe(true)
      expect(existsSync(join(dir, '.crunes', 'runes', `${n}.js`))).toBe(false)
    }
    expect(() => loadConfig(dir)).not.toThrow()
  })

  it('writes nothing on a dry run', async () => {
    runes('a.js')
    writeFileSync(join(dir, '.crunes', 'config.json'), JSON.stringify({ runes: { a: {} } }))
    await handler({ configRoot: dir, dryRun: true })
    expect(readJson(join(dir, '.crunes', 'config.json'))).toEqual({ runes: { a: {} } })
    expect(existsSync(join(dir, '.crunes', 'runes', 'a.js'))).toBe(true)
  })
})

describe('crunes migrate --plugin', () => {
  it('rewrites a format 1 manifest as format 2', async () => {
    mkdirSync(join(dir, '.crunes-plugin'))
    mkdirSync(join(dir, 'runes'))
    writeFileSync(join(dir, 'runes', 'hello.js'), 'export function run() {}\n')
    writeFileSync(join(dir, 'runes', 'other.js'), 'export function run() {}\n')
    writeFileSync(join(dir, '.crunes-plugin', 'plugin.json'), JSON.stringify({
      format: '1', name: 'p', version: '1.0.0',
      runes: { hello: { description: 'Hi', permissions: { run: { allow: ['fs.read:**'] } } }, other: { path: 'runes/other.js' } },
    }))

    await handler({ configRoot: dir, pluginDir: dir })

    const json = readJson(join(dir, '.crunes-plugin', 'plugin.json'))
    expect(json.format).toBe('2')
    expect(json.runes).toEqual({
      hello: { description: 'Hi', run: { command: 'runes/hello.rune.js', permissions: { allow: ['fs.read:**'] } } },
      other: { run: 'runes/other.rune.js' },
    })
    expect(() => validatePluginJson(json)).not.toThrow()
    expect(existsSync(join(dir, 'runes', 'hello.rune.js'))).toBe(true)
  })
})
