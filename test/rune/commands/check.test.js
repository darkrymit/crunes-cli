import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../src/core/config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../../src/rune/resolver.js', () => ({ runRune: vi.fn() }))

import { loadConfig } from '../../../src/core/config.js'
import { runRune } from '../../../src/rune/resolver.js'
import { scanPermissionWarnings, handler } from '../../../src/rune/commands/check.js'

describe('scanPermissionWarnings', () => {
  it('returns empty array for rune with no gated utils', () => {
    expect(scanPermissionWarnings('const x = 1')).toEqual([])
  })

  it('detects utils.fs usage', () => {
    expect(scanPermissionWarnings('const data = await utils.fs.read("package.json")')).toContain('utils.fs')
  })

  it('detects utils.shell usage', () => {
    expect(scanPermissionWarnings('const out = await utils.shell("npm list")')).toContain('utils.shell')
  })

  it('detects utils.fetch usage', () => {
    expect(scanPermissionWarnings('const res = await utils.fetch("https://api.example.com")')).toContain('utils.fetch')
  })

  it('detects utils.env usage', () => {
    expect(scanPermissionWarnings('const token = await utils.env.get("MY_TOKEN")')).toContain('utils.env')
  })

  it('detects multiple gated utils in same source', () => {
    const src = 'await utils.fs.read("x"); await utils.fetch("http://example.com")'
    const warnings = scanPermissionWarnings(src)
    expect(warnings).toContain('utils.fs')
    expect(warnings).toContain('utils.fetch')
    expect(warnings).not.toContain('utils.shell')
  })

  it('returns empty array for empty source', () => {
    expect(scanPermissionWarnings('')).toEqual([])
  })
})

describe('handler — runeArgs', () => {
  const VALID_SECTIONS = [{ name: 'out', data: { type: 'markdown', content: 'x' } }]

  beforeEach(() => {
    loadConfig.mockReturnValue({ runes: { myrune: { path: 'runes/myrune.js' } } })
    runRune.mockResolvedValue(VALID_SECTIONS)
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit(${code})`) })
  })

  afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks() })

  it('passes runeArgs to runRune', async () => {
    await handler({ key: 'myrune', runeArgs: ['--foo', 'bar'], projectRoot: '/p', configRoot: '/p' })
    expect(runRune).toHaveBeenCalledWith('/p', expect.anything(), 'myrune', ['--foo', 'bar'], expect.anything())
  })

  it('passes empty array when no runeArgs given', async () => {
    await handler({ key: 'myrune', runeArgs: [], projectRoot: '/p', configRoot: '/p' })
    expect(runRune).toHaveBeenCalledWith('/p', expect.anything(), 'myrune', [], expect.anything())
  })

  it('uses key directly for runRune lookup', async () => {
    await handler({ key: 'myrune', runeArgs: [], projectRoot: '/p', configRoot: '/p' })
    const [, , calledKey] = runRune.mock.calls[0]
    expect(calledKey).toBe('myrune')
  })
})
