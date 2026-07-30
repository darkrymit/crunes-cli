import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { loadConfig, ROOTLESS, LAYER } from '../../src/core/config.js'

let dir, store, prevStore, prevNoGlobal

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'crunes-load-'))
  store = path.join(dir, 'store')
  mkdirSync(store, { recursive: true })
  prevStore = process.env.CRUNES_STORE
  prevNoGlobal = process.env.CRUNES_NO_GLOBAL
  process.env.CRUNES_STORE = store
  delete process.env.CRUNES_NO_GLOBAL
})

afterEach(() => {
  process.env.CRUNES_STORE = prevStore
  if (prevNoGlobal === undefined) delete process.env.CRUNES_NO_GLOBAL
  else process.env.CRUNES_NO_GLOBAL = prevNoGlobal
})

const writeGlobal = obj => writeFileSync(path.join(store, 'config.json'), JSON.stringify(obj))
const writeProject = (root, obj) => {
  mkdirSync(path.join(root, '.crunes'), { recursive: true })
  writeFileSync(path.join(root, '.crunes', 'config.json'), JSON.stringify(obj))
}

describe('loadConfig layering', () => {
  it('returns the global layer alone and marks rootless when no project config exists', () => {
    writeGlobal({ runes: { serve: { path: 'runes/serve.js' } } })
    const config = loadConfig(dir)
    expect(config[ROOTLESS]).toBe(true)
    expect(config.runes.serve.path.replace(/\\/g, '/')).toBe(path.join(store, 'runes/serve.js').replace(/\\/g, '/'))
  })

  it('is not rootless once a project config exists', () => {
    writeGlobal({ runes: { serve: {} } })
    writeProject(dir, { runes: {} })
    expect(loadConfig(dir)[ROOTLESS]).toBe(false)
  })

  it('lets the project layer override a global rune var while keeping the global path', () => {
    writeGlobal({ runes: { serve: { path: 'runes/serve.js', vars: { port: 3000 } } } })
    writeProject(dir, { runes: { serve: { vars: { port: 4000 } } } })
    const config = loadConfig(dir)
    expect(config.runes.serve.path.replace(/\\/g, '/')).toBe(path.join(store, 'runes/serve.js').replace(/\\/g, '/'))
    expect(config.runes.serve.vars).toEqual({ port: 4000 })
  })

  it('lets the project layer disable a globally-enabled plugin', () => {
    writeGlobal({ plugins: { 'mp@plug': true } })
    writeProject(dir, { plugins: { 'mp@plug': false } })
    expect(loadConfig(dir).plugins).toEqual({ 'mp@plug': false })
  })

  it('tags the winning layer for display', () => {
    writeGlobal({ runes: { serve: {} } })
    writeProject(dir, { runes: {} })
    expect(loadConfig(dir).runes.serve[LAYER]).toBe('global')
  })

  it('skips the global layer entirely under CRUNES_NO_GLOBAL', () => {
    process.env.CRUNES_NO_GLOBAL = '1'
    writeGlobal({ runes: { serve: {} } })
    writeProject(dir, { runes: {} })
    expect(loadConfig(dir).runes.serve).toBeUndefined()
  })

  it('treats a missing global config as normal, not an error', () => {
    writeProject(dir, { runes: {} })
    expect(() => loadConfig(dir)).not.toThrow()
  })

  it('hard-errors on invalid global JSON rather than silently dropping the layer', () => {
    writeFileSync(path.join(store, 'config.json'), '{ not json')
    writeProject(dir, { runes: {} })
    expect(() => loadConfig(dir)).toThrow(/config\.json is invalid JSON/)
  })
})
