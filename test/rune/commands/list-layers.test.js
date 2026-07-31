import { describe, it, expect, beforeEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { collectListRows } from '../../../src/rune/commands/list.js'

let dir, emptyDir, store
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'crunes-list-layer-'))
  emptyDir = mkdtempSync(path.join(os.tmpdir(), 'crunes-list-empty-'))
  store = mkdtempSync(path.join(os.tmpdir(), 'crunes-list-store-'))
  process.env.CRUNES_STORE = store
  writeFileSync(path.join(store, 'config.json'), JSON.stringify({ runes: { serve: {} } }))
  mkdirSync(path.join(dir, '.crunes'), { recursive: true })
  writeFileSync(path.join(dir, '.crunes', 'config.json'),
    JSON.stringify({ runes: { build: { path: '.crunes/runes/build.js' } } }))
})

describe('collectListRows', () => {
  it('labels each rune with the layer it came from', async () => {
    const { rows } = await collectListRows({ projectRoot: dir })
    expect(rows.find(r => r.key === 'serve').layer).toBe('global')
    expect(rows.find(r => r.key === 'build').layer).toBe('project')
  })

  it('reports rootless when no project config exists', async () => {
    const { rows, rootless } = await collectListRows({ projectRoot: emptyDir })
    expect(rootless).toBe(true)
    expect(rows.every(r => r.layer === 'global')).toBe(true)
  })

  it('shows only global entries under -g', async () => {
    const { rows } = await collectListRows({ projectRoot: dir, global: true })
    expect(rows.every(r => r.layer === 'global')).toBe(true)
    expect(rows.map(r => r.key)).toEqual(['serve'])
  })
})
