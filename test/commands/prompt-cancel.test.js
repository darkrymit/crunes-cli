import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const { CANCEL } = vi.hoisted(() => ({ CANCEL: Symbol('clack:cancel') }))
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  isCancel: v => v === CANCEL,
  confirm: vi.fn(async () => CANCEL),
  text: vi.fn(async () => CANCEL),
  select: vi.fn(async () => CANCEL),
}))

import { handler as init } from '../../src/core/commands/init.js'
import { handler as createRune } from '../../src/rune/commands/create.js'
import { handler as createTemplate } from '../../src/template/commands/create.js'
import { handler as createPlugin } from '../../src/plugin/commands/create.js'

describe('cancelling a prompt writes nothing', () => {
  let tmp, wasTTY

  beforeEach(() => {
    tmp = mkdtempSync(join(os.tmpdir(), 'crunes-cancel-'))
    wasTTY = process.stdout.isTTY
    process.stdout.isTTY = true
  })

  afterEach(() => {
    process.stdout.isTTY = wasTTY
    rmSync(tmp, { recursive: true, force: true })
  })

  const write = (rel, body) => {
    mkdirSync(join(tmp, rel, '..'), { recursive: true })
    writeFileSync(join(tmp, rel), body)
  }

  it('init keeps an existing config', async () => {
    write('.crunes/config.json', '{"runes":{"mine":{"run":"x.sh"}}}')
    await init({ projectRoot: tmp })
    expect(readFileSync(join(tmp, '.crunes/config.json'), 'utf8')).toContain('mine')
  })

  it('plugin create keeps a non-empty folder', async () => {
    write('plug/README.md', 'mine')
    await createPlugin({ name: 'plug', description: 'd', author: 'a', license: 'MIT', projectRoot: tmp })
    expect(readdirSync(join(tmp, 'plug'))).toEqual(['README.md'])
    expect(readFileSync(join(tmp, 'plug/README.md'), 'utf8')).toBe('mine')
  })

  it.each([
    ['name', {}],
    ['description', { name: 'plug' }],
    ['author', { name: 'plug', description: 'd' }],
    ['license', { name: 'plug', description: 'd', author: 'a' }],
  ])('plugin create stops at the %s prompt', async (_, opts) => {
    await createPlugin({ ...opts, projectRoot: tmp })
    expect(readdirSync(tmp)).toEqual([])
  })

  it.each([
    ['key', {}],
    ['format', { key: 'k' }],
    ['path', { key: 'k', format: 'markdown' }],
    ['name', { key: 'k', format: 'markdown', path: 'k.rune.js' }],
    ['description', { key: 'k', format: 'markdown', path: 'k.rune.js', name: 'K' }],
  ])('create stops at the %s prompt', async (_, opts) => {
    await createRune({ ...opts, projectRoot: tmp, configRoot: tmp })
    expect(readdirSync(tmp)).toEqual([])
  })

  it('create stops when choosing between plugin and project', async () => {
    write('.crunes/config.json', '{"runes":{}}')
    write('.crunes-plugin/plugin.json', '{"format":"1","runes":{}}')
    await createRune({ key: 'k', format: 'markdown', path: 'k.rune.js', name: 'K', description: 'd', projectRoot: tmp, configRoot: tmp })
    expect(readdirSync(tmp).sort()).toEqual(['.crunes', '.crunes-plugin'])
  })

  it.each([
    ['name', {}],
    ['path', { name: 't' }],
    ['display name', { name: 't', path: 't' }],
    ['description', { name: 't', path: 't', templateName: 'T' }],
  ])('template create stops at the %s prompt', async (_, opts) => {
    await createTemplate({ ...opts, projectRoot: tmp, configRoot: tmp })
    expect(readdirSync(tmp)).toEqual([])
  })
})
