import { describe, it, expect, beforeEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { handler as initHandler } from '../../../src/core/commands/init.js'
import { handler as createHandler } from '../../../src/rune/commands/create.js'

let dir
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'crunes-global-cli-'))
  process.env.CRUNES_STORE = path.join(dir, 'store')
  mkdirSync(process.env.CRUNES_STORE, { recursive: true })
})

describe('init -g', () => {
  it('creates config.json at the store root with no .crunes segment', async () => {
    // projectRoot is passed explicitly so a regression can never fall back to
    // process.cwd() and scribble into this repository.
    await initHandler({ yes: true, global: true, projectRoot: dir })
    expect(existsSync(path.join(process.env.CRUNES_STORE, 'config.json'))).toBe(true)
    expect(existsSync(path.join(process.env.CRUNES_STORE, '.crunes'))).toBe(false)
  })
})

describe('create -g', () => {
  it('writes the rune under the store and registers it globally', async () => {
    await initHandler({ yes: true, global: true, projectRoot: dir })
    await createHandler({ key: 'serve', format: 'markdown', global: true, yes: true, projectRoot: dir, configRoot: dir })
    const store = process.env.CRUNES_STORE
    expect(existsSync(path.join(store, 'runes', 'serve.js'))).toBe(true)
    const config = JSON.parse(readFileSync(path.join(store, 'config.json'), 'utf8'))
    expect(config.runes.serve.path).toBe('runes/serve.js')
  })
})
