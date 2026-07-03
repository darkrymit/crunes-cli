import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

import {
  pluginJson,
  marketplaceJson,
  exampleRune,
  exampleTemplate,
  readmeMd,
  changelogMd,
  handler,
} from '../../../src/plugin/commands/create.js'

const BASE_OPTS = { name: 'my-plugin', description: 'A test plugin', author: 'Alice', license: 'MIT' }

// --- Template functions ---

describe('pluginJson', () => {
  it('produces valid JSON', () => {
    expect(() => JSON.parse(pluginJson(BASE_OPTS))).not.toThrow()
  })

  it('matches snapshot', () => {
    expect(pluginJson(BASE_OPTS)).toMatchSnapshot()
  })
})

describe('marketplaceJson', () => {
  it('produces valid JSON', () => {
    expect(() => JSON.parse(marketplaceJson(BASE_OPTS))).not.toThrow()
  })

  it('matches snapshot', () => {
    expect(marketplaceJson(BASE_OPTS)).toMatchSnapshot()
  })
})

describe('exampleRune', () => {
  it('matches snapshot', () => {
    expect(exampleRune()).toMatchSnapshot()
  })
})

describe('exampleTemplate', () => {
  it('matches snapshot', () => {
    expect(exampleTemplate()).toMatchSnapshot()
  })
})

describe('readmeMd', () => {
  it('matches snapshot', () => {
    expect(readmeMd(BASE_OPTS)).toMatchSnapshot()
  })
})

describe('changelogMd', () => {
  it('matches snapshot', () => {
    expect(changelogMd()).toMatchSnapshot()
  })
})

// --- Handler ---

function makeTmp() {
  const dir = join(os.tmpdir(), `crunes-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('handler (non-interactive)', () => {
  let exitSpy

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('validation', () => {
    it('exits 1 when name is missing', async () => {
      await expect(handler({ description: 'x', yes: true })).rejects.toThrow('process.exit(1)')
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('defaults description and prints an info message when description is omitted', async () => {
      const tmp = makeTmp()
      const out = join(tmp, 'my-plugin')
      const { output } = await import('../../../src/shared/output.js')
      const infoSpy = vi.spyOn(output, 'info').mockImplementation(() => {})
      try {
        await handler({ name: 'my-plugin', out, yes: true })
        const mj = JSON.parse(readFileSync(join(out, '.crunes-plugin', 'marketplace.json'), 'utf8'))
        expect(mj.description).toBe('my-plugin — a crunes plugin')
        expect(mj.plugins[0].description).toBe('my-plugin — a crunes plugin')
        const readme = readFileSync(join(out, 'README.md'), 'utf8')
        expect(readme).toContain('my-plugin — a crunes plugin')
        expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('my-plugin — a crunes plugin'))
      } finally {
        infoSpy.mockRestore()
        rmSync(tmp, { recursive: true, force: true })
      }
    })
  })

  describe('directory guard', () => {
    it('exits 1 when output dir is non-empty', async () => {
      const tmp = makeTmp()
      writeFileSync(join(tmp, 'existing.txt'), 'data')
      try {
        await expect(handler({ name: 'x', description: 'y', out: tmp, yes: true }))
          .rejects.toThrow('process.exit(1)')
        expect(exitSpy).toHaveBeenCalledWith(1)
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    })

    it('proceeds when output dir exists but is empty', async () => {
      const tmp = makeTmp()
      const out = join(tmp, 'empty-out')
      mkdirSync(out)
      try {
        await handler({ ...BASE_OPTS, out, yes: true })
        expect(existsSync(join(out, 'README.md'))).toBe(true)
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    })
  })

  describe('file scaffolding', () => {
    let tmp, out

    beforeEach(() => {
      tmp = makeTmp()
      out = join(tmp, 'my-plugin')
    })

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true })
    })

    it('creates all 6 expected files', async () => {
      await handler({ ...BASE_OPTS, out, yes: true })
      for (const rel of [
        '.crunes-plugin/plugin.json',
        '.crunes-plugin/marketplace.json',
        'runes/example.js',
        'templates/example-template.js',
        'README.md',
        'CHANGELOG.md',
      ]) {
        expect(existsSync(join(out, rel)), rel).toBe(true)
      }
    })

    it('writes valid plugin.json and marketplace.json with correct name', async () => {
      await handler({ ...BASE_OPTS, out, yes: true })
      const pj = JSON.parse(readFileSync(join(out, '.crunes-plugin', 'plugin.json'), 'utf8'))
      const mj = JSON.parse(readFileSync(join(out, '.crunes-plugin', 'marketplace.json'), 'utf8'))
      expect(pj.name).toBeUndefined()
      expect(pj.format).toBe('1')
      expect(mj.plugins[0].name).toBe('my-plugin')
    })

    it('generates plugin.json with namespaced permissions schema', async () => {
      await handler({ ...BASE_OPTS, out, yes: true })
      const pj = JSON.parse(readFileSync(join(out, '.crunes-plugin', 'plugin.json'), 'utf8'))
      expect(pj.runes.example.permissions).toEqual({
        run: { allow: [], deny: [] },
      })
    })

    it('defaults license to MIT when not provided in marketplace.json', async () => {
      await handler({ ...BASE_OPTS, license: undefined, out, yes: true })
      const mj = JSON.parse(readFileSync(join(out, '.crunes-plugin', 'marketplace.json'), 'utf8'))
      expect(mj.plugins[0].license).toBe('MIT')
    })

    it('resolves out directory relative to projectRoot', async () => {
      const relOut = 'my-plugin'
      await handler({ ...BASE_OPTS, out: relOut, yes: true, projectRoot: tmp })
      expect(existsSync(join(tmp, 'my-plugin', 'README.md'))).toBe(true)
    })
  })
})
