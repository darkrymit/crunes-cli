import { describe, it, expect, beforeEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { getConfigPath, readRawConfig, writeRawConfig, setPluginEnabled } from '../../src/core/config-writer.js'

let dir
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'crunes-writer-'))
  process.env.CRUNES_STORE = path.join(dir, 'store')
  mkdirSync(process.env.CRUNES_STORE, { recursive: true })
})

describe('getConfigPath', () => {
  it('targets the project .crunes dir by default', () => {
    expect(getConfigPath({ configRoot: '/proj' }).replace(/\\/g, '/')).toBe('/proj/.crunes/config.json')
  })

  it('targets the store root with no .crunes segment when global', () => {
    const expected = path.join(process.env.CRUNES_STORE, 'config.json')
    expect(getConfigPath({ global: true })).toBe(expected)
  })
})

describe('readRawConfig', () => {
  it('returns null for a missing file rather than throwing', () => {
    expect(readRawConfig(path.join(dir, 'nope.json'))).toBe(null)
  })
})

describe('writeRawConfig', () => {
  it('creates the parent directory and persists the object', async () => {
    const p = path.join(dir, 'nested', 'config.json')
    await writeRawConfig(p, { runes: {} })
    expect(JSON.parse(readFileSync(p, 'utf8'))).toEqual({ runes: {} })
  })
})

describe('setPluginEnabled', () => {
  it('converts a legacy array to map form on write', async () => {
    const p = path.join(dir, 'config.json')
    writeFileSync(p, JSON.stringify({ plugins: ['a@x'] }))
    await setPluginEnabled(p, 'b@y', true)
    expect(JSON.parse(readFileSync(p, 'utf8')).plugins).toEqual({ 'a@x': true, 'b@y': true })
  })

  it('records an explicit false so a project can opt out', async () => {
    const p = path.join(dir, 'config.json')
    writeFileSync(p, JSON.stringify({ plugins: {} }))
    await setPluginEnabled(p, 'a@x', false)
    expect(JSON.parse(readFileSync(p, 'utf8')).plugins).toEqual({ 'a@x': false })
  })

  it('throws a directed error when the config file is absent', async () => {
    await expect(setPluginEnabled(path.join(dir, 'nope.json'), 'a@x', true))
      .rejects.toThrow('No config found')
  })
})
