import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

import { templateStub, handler } from '../../../src/template/commands/create.js'

// --- templateStub() ---

describe('templateStub', () => {
  it('matches snapshot', () => {
    expect(templateStub('mytemplate')).toMatchSnapshot()
  })

  it('uses @utils import, not utils parameter', () => {
    const out = templateStub('mytemplate')
    expect(out).toContain("from '@utils'")
    expect(out).not.toContain('use(dir,')
    expect(out).not.toContain('use(dir, args')
  })

  it('exports run(args) — single-argument modern signature', () => {
    const out = templateStub('mytemplate')
    expect(out).toMatch(/export async function run\(args\)/)
  })

  it('includes commented-out args export example', () => {
    const out = templateStub('mytemplate')
    expect(out).toContain('export async function args(b)')
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
    it('exits 1 when name is missing', async () => {
      await expect(handler({ yes: true, projectRoot: tmp, configRoot: tmp }))
        .rejects.toThrow('process.exit(1)')
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('file creation', () => {
    it('creates template file at default path under configRoot', async () => {
      await handler({ name: 'mytemplate', yes: true, projectRoot: tmp, configRoot: tmp })
      expect(existsSync(join(tmp, '.crunes', 'templates', 'mytemplate.js'))).toBe(true)
    })

    it('creates template file with modern run(args) signature', async () => {
      await handler({ name: 'mytemplate', yes: true, projectRoot: tmp, configRoot: tmp })
      const content = readFileSync(join(tmp, '.crunes', 'templates', 'mytemplate.js'), 'utf8')
      expect(content).toMatch(/export async function run\(args\)/)
      expect(content).toContain("from '@utils'")
    })
  })

  describe('config registration', () => {
    it('registers template in .crunes/config.json under configRoot', async () => {
      await handler({ name: 'mytemplate', yes: true, projectRoot: tmp, configRoot: tmp })
      const config = JSON.parse(readFileSync(join(tmp, '.crunes', 'config.json'), 'utf8'))
      expect(config.templates.mytemplate).toBeDefined()
      expect(config.templates.mytemplate.path).toBe('.crunes/templates/mytemplate.js')
    })

    it('stores templateName and description in config when provided', async () => {
      await handler({ name: 'mytemplate', templateName: 'My Template', description: 'Does stuff', yes: true, projectRoot: tmp, configRoot: tmp })
      const config = JSON.parse(readFileSync(join(tmp, '.crunes', 'config.json'), 'utf8'))
      expect(config.templates.mytemplate.name).toBe('My Template')
      expect(config.templates.mytemplate.description).toBe('Does stuff')
    })

    it('preserves existing entries in config', async () => {
      const configDir = join(tmp, '.crunes')
      mkdirSync(configDir, { recursive: true })
      writeFileSync(join(configDir, 'config.json'), JSON.stringify({ runes: { existing: { path: 'existing.js' } } }, null, 2))
      await handler({ name: 'newtemplate', yes: true, projectRoot: tmp, configRoot: tmp })
      const config = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf8'))
      expect(config.runes.existing).toBeDefined()
      expect(config.templates.newtemplate).toBeDefined()
    })

    it('uses configRoot for config, not projectRoot', async () => {
      const configRoot = join(tmp, 'config-repo')
      const projectRoot = join(tmp, 'project')
      mkdirSync(configRoot, { recursive: true })
      mkdirSync(projectRoot, { recursive: true })
      await handler({ name: 'mytemplate', yes: true, projectRoot, configRoot })
      expect(existsSync(join(configRoot, '.crunes', 'config.json'))).toBe(true)
      expect(existsSync(join(projectRoot, '.crunes', 'config.json'))).toBe(false)
    })
  })
})
