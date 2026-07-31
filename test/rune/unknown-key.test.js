import { describe, it, expect, beforeEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync } from 'node:fs'
import { resolveRuneEntry } from '../../src/rune/resolver.js'

beforeEach(() => {
  process.env.CRUNES_STORE = mkdtempSync(path.join(os.tmpdir(), 'crunes-unknown-'))
  delete process.env.CRUNES_NO_GLOBAL
})

describe('unknown key error', () => {
  it('names the layers that were consulted', async () => {
    await expect(resolveRuneEntry('/proj', { runes: {} }, 'nope'))
      .rejects.toThrow(/Unknown key: "nope"[\s\S]*Looked in/)
  })

  it('says so when the global layer was skipped', async () => {
    process.env.CRUNES_NO_GLOBAL = '1'
    await expect(resolveRuneEntry('/proj', { runes: {} }, 'nope'))
      .rejects.toThrow(/CRUNES_NO_GLOBAL=1/)
  })
})
