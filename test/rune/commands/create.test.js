import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
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

    it('exits 1 when format is missing', async () => {
      await expect(handler({ key: 'myrune', yes: true, projectRoot: tmp, configRoot: tmp }))
        .rejects.toThrow('process.exit(1)')
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('exits 1 when format is invalid', async () => {
      await expect(handler({ key: 'myrune', format: 'xml', yes: true, projectRoot: tmp, configRoot: tmp }))
        .rejects.toThrow('process.exit(1)')
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('file creation', () => {
    it('creates rune file at default path under configRoot', async () => {
      await handler({ key: 'myrune', format: 'markdown', yes: true, projectRoot: tmp, configRoot: tmp })
      expect(existsSync(join(tmp, '.crunes', 'runes', 'myrune.js'))).toBe(true)
    })

    it('creates rune file with modern run(args) signature', async () => {
      await handler({ key: 'myrune', format: 'markdown', yes: true, projectRoot: tmp, configRoot: tmp })
      const content = readFileSync(join(tmp, '.crunes', 'runes', 'myrune.js'), 'utf8')
      expect(content).toMatch(/export async function run\(args\)/)
      expect(content).toContain("from '@utils'")
    })

    it('creates rune file at custom path under configRoot', async () => {
      await handler({ key: 'myrune', format: 'markdown', path: 'custom/myrune.js', yes: true, projectRoot: tmp, configRoot: tmp })
      expect(existsSync(join(tmp, 'custom', 'myrune.js'))).toBe(true)
    })
  })

  describe('config registration', () => {
    it('registers rune in .crunes/config.json under configRoot', async () => {
      await handler({ key: 'myrune', format: 'markdown', yes: true, projectRoot: tmp, configRoot: tmp })
      const config = JSON.parse(readFileSync(join(tmp, '.crunes', 'config.json'), 'utf8'))
      expect(config.runes.myrune).toBeDefined()
      expect(config.runes.myrune.path).toBe('.crunes/runes/myrune.js')
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
      writeFileSync(join(configDir, 'config.json'), JSON.stringify({ runes: { existing: { path: 'existing.js' } } }, null, 2))
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
