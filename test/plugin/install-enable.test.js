import { describe, it, expect, beforeEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { installPlugin } from '../../src/plugin/install.js'

let store, project, source
const provenance = { marketplaceName: 'mkt', pluginName: 'plug', version: '1.0.0' }

beforeEach(() => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crunes-install-enable-'))
  store = path.join(dir, 'store')
  project = path.join(dir, 'project')
  source = path.join(dir, 'plug')
  process.env.CRUNES_STORE = store
  mkdirSync(store)
  mkdirSync(project)
  mkdirSync(path.join(source, '.crunes-plugin'), { recursive: true })
  mkdirSync(path.join(source, 'src'))
  writeFileSync(path.join(source, 'src/index.rune.js'), 'export function run() {}')
  writeFileSync(path.join(source, '.crunes-plugin/plugin.json'), JSON.stringify({
    format: '1',
    runes: { plug: { run: { command: 'src/index.rune.js', permissions: { allow: [], deny: [] } } } },
  }))
})

const globalConfig = () => path.join(store, 'config.json')
const readGlobal = () => JSON.parse(readFileSync(globalConfig(), 'utf8'))
const install = (global) => installPlugin(source, project, provenance, { yes: true, global })

describe('installPlugin enabling', () => {
  it('creates the global config when -g is used and none exists', async () => {
    await install(true)
    expect(readGlobal()).toEqual({ runes: {}, plugins: { 'mkt@plug': true } })
  })

  it('keeps what an existing global config holds', async () => {
    writeFileSync(globalConfig(), JSON.stringify({ runes: { a: { run: {} } }, plugins: { 'x@y': true } }))
    await install(true)
    expect(readGlobal()).toEqual({ runes: { a: { run: {} } }, plugins: { 'x@y': true, 'mkt@plug': true } })
  })

  it('fails and leaves an invalid global config untouched', async () => {
    writeFileSync(globalConfig(), '{ broken')
    await expect(install(true)).rejects.toThrow()
    expect(readFileSync(globalConfig(), 'utf8')).toBe('{ broken')
  })

  it('repairs an earlier install that was registered but never enabled', async () => {
    await install(false)
    expect(existsSync(globalConfig())).toBe(false)
    await install(true)
    expect(readGlobal().plugins).toEqual({ 'mkt@plug': true })
  })

  it('creates no project config for a rootless install without -g', async () => {
    await install(false)
    expect(existsSync(path.join(project, '.crunes'))).toBe(false)
  })
})
