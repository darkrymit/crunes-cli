import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

import { template, handler } from '../../../src/rune/commands/create.js'

// --- template() ---

describe('template', () => {
  it('markdown format matches snapshot', () => {
    expect(template('mykey', 'markdown')).toMatchSnapshot()
  })

  it('tree format matches snapshot', () => {
    expect(template('mykey', 'tree')).toMatchSnapshot()
  })

  it('uses @utils import, not utils parameter', () => {
    const out = template('mykey', 'markdown')
    expect(out).toContain("from '@utils'")
    expect(out).not.toContain('use(dir,')
    expect(out).not.toContain('use(dir, args')
  })

  it('exports run(args) — single-argument modern signature', () => {
    const out = template('mykey', 'markdown')
    expect(out).toMatch(/export async function run\(args\)/)
  })

  it('includes commented-out args export example', () => {
    const out = template('mykey', 'markdown')
    expect(out).toContain('export async function args(b)')
  })

  it('tree format imports tree from @utils', () => {
    const out = template('mykey', 'tree')
    expect(out).toContain('tree')
    expect(out).toContain("from '@utils'")
  })

  it('outro references crunes run, not crunes query', () => {
    // The outro message is in the handler, but verify template has no such bug
    const out = template('mykey', 'markdown')
    expect(out).not.toContain('crunes query')
  })
})

// --- handler (non-interactive) ---

function makeTmp() {
  const dir = join(os.tmpdir(), `crunes-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('handler (non-interactive)', () => {
  let exitSpy, tmp

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })
    tmp = makeTmp()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(tmp, { recursive: true, force: true })
  })

  describe('validation', () => {
    it('exits 1 when key is missing', async () => {
      await expect(handler({ format: 'markdown', yes: true, projectRoot: tmp, configRoot: tmp }))
        .rejects.toThrow('process.exit(1)')
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('exits 1 when format is invalid', async () => {
      await expect(handler({ key: 'myrune', format: 'xml', yes: true, projectRoot: tmp, configRoot: tmp }))
        .rejects.toThrow('process.exit(1)')
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('defaults format to markdown and prints an info message when format is omitted', async () => {
      const { output } = await import('../../../src/shared/output.js')
      const infoSpy = vi.spyOn(output, 'info').mockImplementation(() => {})
      await handler({ key: 'myrune', yes: true, projectRoot: tmp, configRoot: tmp })
      expect(existsSync(join(tmp, '.crunes', 'runes', 'myrune', 'src', 'index.rune.js'))).toBe(true)
      expect(existsSync(join(tmp, '.crunes', 'runes', 'myrune', 'test', 'myrune.test.js'))).toBe(true)
      const content = readFileSync(join(tmp, '.crunes', 'runes', 'myrune', 'src', 'index.rune.js'), 'utf8')
      expect(content).toContain('md.h3')
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('markdown'))
      infoSpy.mockRestore()
    })
  })

  describe('file creation', () => {
    it('creates rune file at default path under configRoot', async () => {
      await handler({ key: 'myrune', format: 'markdown', yes: true, projectRoot: tmp, configRoot: tmp })
      expect(existsSync(join(tmp, '.crunes', 'runes', 'myrune', 'src', 'index.rune.js'))).toBe(true)
      expect(existsSync(join(tmp, '.crunes', 'runes', 'myrune', 'test', 'myrune.test.js'))).toBe(true)
    })

    it('creates rune file with modern run(args) signature', async () => {
      await handler({ key: 'myrune', format: 'markdown', yes: true, projectRoot: tmp, configRoot: tmp })
      const content = readFileSync(join(tmp, '.crunes', 'runes', 'myrune', 'src', 'index.rune.js'), 'utf8')
      expect(content).toMatch(/export async function run\(args\)/)
      expect(content).toContain("from '@utils'")
    })

    it('creates rune file at custom path under configRoot', async () => {
      await handler({ key: 'myrune', format: 'markdown', path: 'custom/myrune.rune.js', yes: true, projectRoot: tmp, configRoot: tmp })
      expect(existsSync(join(tmp, 'custom', 'myrune.rune.js'))).toBe(true)
    })

    it('refuses a path that does not name an isolate module', async () => {
      await expect(handler({ key: 'myrune', format: 'markdown', path: 'custom/myrune.js', yes: true, projectRoot: tmp, configRoot: tmp }))
        .rejects.toThrow('process.exit(1)')
      expect(existsSync(join(tmp, 'custom', 'myrune.js'))).toBe(false)
    })
  })

  describe('config registration', () => {
    it('registers rune in .crunes/config.json under configRoot', async () => {
      await handler({ key: 'myrune', format: 'markdown', yes: true, projectRoot: tmp, configRoot: tmp })
      const config = JSON.parse(readFileSync(join(tmp, '.crunes', 'config.json'), 'utf8'))
      expect(config.runes.myrune).toBeDefined()
      expect(config.runes.myrune.run).toBe('.crunes/runes/myrune/src/index.rune.js')
    })

    it('stores name and description in config when provided', async () => {
      await handler({ key: 'myrune', format: 'markdown', name: 'My Rune', description: 'Does stuff', yes: true, projectRoot: tmp, configRoot: tmp })
      const config = JSON.parse(readFileSync(join(tmp, '.crunes', 'config.json'), 'utf8'))
      expect(config.runes.myrune.name).toBe('My Rune')
      expect(config.runes.myrune.description).toBe('Does stuff')
    })

    it('preserves existing rune entries in config', async () => {
      const configDir = join(tmp, '.crunes')
      mkdirSync(configDir, { recursive: true })
      writeFileSync(join(configDir, 'config.json'), JSON.stringify({ runes: { existing: { run: 'existing.rune.js' } } }, null, 2))
      await handler({ key: 'newrune', format: 'markdown', yes: true, projectRoot: tmp, configRoot: tmp })
      const config = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf8'))
      expect(config.runes.existing).toBeDefined()
      expect(config.runes.newrune).toBeDefined()
    })

    it('uses configRoot for config, not projectRoot', async () => {
      const configRoot = join(tmp, 'config-repo')
      const projectRoot = join(tmp, 'project')
      mkdirSync(configRoot, { recursive: true })
      mkdirSync(projectRoot, { recursive: true })
      await handler({ key: 'myrune', format: 'markdown', yes: true, projectRoot, configRoot })
      expect(existsSync(join(configRoot, '.crunes', 'config.json'))).toBe(true)
      expect(existsSync(join(projectRoot, '.crunes', 'config.json'))).toBe(false)
    })
  })

  describe('outro message', () => {
    it('outputs crunes run, not crunes query', async () => {
      const logs = []
      vi.spyOn(process.stdout, 'write').mockImplementation(s => { logs.push(s); return true })
      // capture output module calls
      const { output } = await import('../../../src/shared/output.js')
      const infoSpy = vi.spyOn(output, 'info').mockImplementation(s => logs.push(s))
      await handler({ key: 'myrune', format: 'markdown', yes: true, projectRoot: tmp, configRoot: tmp })
      const allOutput = logs.join(' ')
      expect(allOutput).not.toContain('crunes query')
      infoSpy.mockRestore()
    })
  })
})

describe('crunes create --lang — scaffolds a script rune', () => {
  let dir
  beforeEach(() => {
    dir = mkdtempSync(join(os.tmpdir(), 'crunes-create-lang-'))
    mkdirSync(join(dir, '.crunes'), { recursive: true })
    writeFileSync(join(dir, '.crunes', 'config.json'), '{ "runes": {} }')
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
  })
  afterEach(() => { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }) })

  const config = () => JSON.parse(readFileSync(join(dir, '.crunes', 'config.json'), 'utf8'))

  it.each([
    ['python', '.crunes/runes/lint/src/index.py', 'CRUNES_VARS'],
    ['bash', '.crunes/runes/lint/src/index.sh', 'CRUNES_ARGS'],
    ['node', '.crunes/runes/lint/src/index.js', 'CRUNES_VARS'],
  ])('%s writes %s and a run entry', async (lang, rel, mentions) => {
    await handler({ key: 'lint', lang, description: 'Lint', projectRoot: dir, configRoot: dir })
    expect(readFileSync(join(dir, rel), 'utf8')).toContain(mentions)
    expect(config().runes.lint).toEqual({ description: 'Lint', run: rel })
  })

  it('refuses a key that already exists', async () => {
    await handler({ key: 'lint', lang: 'bash', projectRoot: dir, configRoot: dir })
    await expect(handler({ key: 'lint', lang: 'bash', projectRoot: dir, configRoot: dir })).rejects.toThrow('exit')
  })
})

describe('crunes create — plugin & dual-mode targets', () => {
  let dir
  beforeEach(() => {
    dir = mkdtempSync(join(os.tmpdir(), 'crunes-create-plugin-'))
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
  })
  afterEach(() => { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }) })

  it('targets .crunes-plugin/plugin.json automatically when only plugin.json exists', async () => {
    mkdirSync(join(dir, '.crunes-plugin'), { recursive: true })
    writeFileSync(join(dir, '.crunes-plugin', 'plugin.json'), JSON.stringify({ format: '1', runes: {} }))

    await handler({ key: 'first', yes: true, projectRoot: dir, configRoot: dir })
    expect(existsSync(join(dir, 'src/index.rune.js'))).toBe(true)
    expect(existsSync(join(dir, 'test/first.test.js'))).toBe(true)

    await handler({ key: 'second', yes: true, projectRoot: dir, configRoot: dir })
    expect(existsSync(join(dir, 'runes/second/src/index.rune.js'))).toBe(true)
    expect(existsSync(join(dir, 'runes/second/test/second.test.js'))).toBe(true)

    const pj = JSON.parse(readFileSync(join(dir, '.crunes-plugin', 'plugin.json'), 'utf8'))
    expect(pj.runes.first.run.command).toBe('src/index.rune.js')
    expect(pj.runes.second.run.command).toBe('runes/second/src/index.rune.js')
  })

  it('requires --plugin or --project when both plugin.json and config.json exist, and honors each flag', async () => {
    mkdirSync(join(dir, '.crunes-plugin'), { recursive: true })
    mkdirSync(join(dir, '.crunes'), { recursive: true })
    writeFileSync(join(dir, '.crunes-plugin', 'plugin.json'), JSON.stringify({ format: '1', runes: { a: { run: { command: 'src/index.rune.js' } } } }))
    writeFileSync(join(dir, '.crunes', 'config.json'), JSON.stringify({ format: '1', runes: {} }))

    await expect(handler({ key: 'x', yes: true, projectRoot: dir, configRoot: dir })).rejects.toThrow('exit')

    await handler({ key: 'devcheck', project: true, yes: true, projectRoot: dir, configRoot: dir })
    expect(existsSync(join(dir, '.crunes/runes/devcheck/src/index.rune.js'))).toBe(true)

    await handler({ key: 'extra', plugin: true, yes: true, projectRoot: dir, configRoot: dir })
    expect(existsSync(join(dir, 'runes/extra/src/index.rune.js'))).toBe(true)
  })
})
