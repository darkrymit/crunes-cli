import { describe, it, expect, beforeEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { handler as enableHandler } from '../../../src/plugin/commands/enable.js'
import { handler as disableHandler } from '../../../src/plugin/commands/disable.js'

let dir, store
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'crunes-plugin-g-'))
  store = mkdtempSync(path.join(os.tmpdir(), 'crunes-plugin-g-store-'))
  process.env.CRUNES_STORE = store
  writeFileSync(path.join(store, 'plugins.json'),
    JSON.stringify({ plugins: { 'mp@plug': { name: 'plug', version: '1.0.0', path: '/x' } } }))
  writeFileSync(path.join(store, 'config.json'), JSON.stringify({}))
  mkdirSync(path.join(dir, '.crunes'), { recursive: true })
  writeFileSync(path.join(dir, '.crunes', 'config.json'), JSON.stringify({}))
})

const readGlobal  = () => JSON.parse(readFileSync(path.join(store, 'config.json'), 'utf8'))
const readProject = () => JSON.parse(readFileSync(path.join(dir, '.crunes', 'config.json'), 'utf8'))

describe('plugin enable -g', () => {
  it('writes true into the global config and leaves the project untouched', async () => {
    await enableHandler({ name: 'mp@plug', projectRoot: dir, global: true })
    expect(readGlobal().plugins).toEqual({ 'mp@plug': true })
    expect(readProject().plugins).toBeUndefined()
  })
})

describe('plugin disable without -g', () => {
  it('mints an explicit false in the project config to opt out of a global enable', async () => {
    await enableHandler({ name: 'mp@plug', projectRoot: dir, global: true })
    await disableHandler({ name: 'mp@plug', projectRoot: dir })
    expect(readProject().plugins).toEqual({ 'mp@plug': false })
    expect(readGlobal().plugins).toEqual({ 'mp@plug': true })
  })
})

describe('plugin disable -g', () => {
  it('writes false into the global config', async () => {
    await enableHandler({ name: 'mp@plug', projectRoot: dir, global: true })
    await disableHandler({ name: 'mp@plug', projectRoot: dir, global: true })
    expect(readGlobal().plugins).toEqual({ 'mp@plug': false })
  })
})
