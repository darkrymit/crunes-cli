import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../src/core/config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../../src/rune/resolver.js', () => ({ runRune: vi.fn(), getRune: vi.fn() }))

import { loadConfig } from '../../../src/core/config.js'
import { runRune } from '../../../src/rune/resolver.js'
import { handler, parseBenchArgs } from '../../../src/rune/commands/benchmark.js'

const MINIMAL_SECTION = [{ name: 'out', data: { type: 'markdown', content: 'x' } }]

describe('parseBenchArgs', () => {
  it('parses bare key with defaults', () => {
    const result = parseBenchArgs(['api'])
    expect(result.segments[0]).toMatchObject({ key: 'api', runeArgs: [], runs: 1, warmup: false })
  })

  it('global --runs before key', () => {
    expect(parseBenchArgs(['--runs', '5', 'api']).segments[0].runs).toBe(5)
  })

  it('global --warmup before key', () => {
    expect(parseBenchArgs(['--warmup', 'api']).segments[0].warmup).toBe(true)
  })

  it('passes rune args through verbatim after key', () => {
    expect(parseBenchArgs(['api', '--verbose', '--flag', 'v']).segments[0].runeArgs).toEqual(['--verbose', '--flag', 'v'])
  })

  it('returns null key for empty argv', () => {
    expect(parseBenchArgs([]).segments[0].key).toBeNull()
  })

  it('handles --runs=N inline form', () => {
    expect(parseBenchArgs(['--runs=3', 'api']).segments[0].runs).toBe(3)
  })

  it('does not intercept --runs after the key — passes it to runeArgs', () => {
    const result = parseBenchArgs(['api', '--runs', '5'])
    expect(result.segments[0].runs).toBe(1)
    expect(result.segments[0].runeArgs).toEqual(['--runs', '5'])
  })

  it('does not intercept --warmup after the key — passes it to runeArgs', () => {
    const result = parseBenchArgs(['api', '--warmup'])
    expect(result.segments[0].warmup).toBe(false)
    expect(result.segments[0].runeArgs).toEqual(['--warmup'])
  })

  it('per-rune --runs in bracket overrides global', () => {
    const result = parseBenchArgs(['--runs', '3', 'api[--runs 5]'])
    expect(result.segments[0].runs).toBe(5)
  })

  it('global --runs applies to segments without per-rune override', () => {
    const result = parseBenchArgs(['-b', '--runs', '3', 'api[--runs 5]', '+', 'other'])
    expect(result.segments[0].runs).toBe(5)
    expect(result.segments[1].runs).toBe(3)
  })

  it('-s in bracket sets sections', () => {
    expect(parseBenchArgs(['api[-s foo]']).segments[0].sections).toEqual(['foo'])
  })

  it('batch mode splits on +', () => {
    const result = parseBenchArgs(['-b', 'api[--runs 5]', 'arg1', '+', 'other'])
    expect(result.isBatch).toBe(true)
    expect(result.segments).toHaveLength(2)
    expect(result.segments[0]).toMatchObject({ key: 'api', runs: 5, runeArgs: ['arg1'] })
    expect(result.segments[1]).toMatchObject({ key: 'other', runs: 1 })
  })

  it('does not intercept --help — passes to runeArgs', () => {
    expect(parseBenchArgs(['api', '--help']).segments[0].runeArgs).toEqual(['--help'])
  })
})

describe('handler — runs validation', () => {
  let exitSpy

  beforeEach(() => {
    loadConfig.mockReturnValue({ runes: {} })
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks() })

  it('exits 1 when --runs is 0', async () => {
    await expect(handler({ key: 'api', runs: 0, projectRoot: '/p', configRoot: '/p' }))
      .rejects.toThrow('process.exit(1)')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits 1 when --runs is negative', async () => {
    await expect(handler({ key: 'api', runs: -3, projectRoot: '/p', configRoot: '/p' }))
      .rejects.toThrow('process.exit(1)')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits 1 when --runs is NaN (from non-numeric string)', async () => {
    await expect(handler({ key: 'api', runs: NaN, projectRoot: '/p', configRoot: '/p' }))
      .rejects.toThrow('process.exit(1)')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits 1 when --runs is a float', async () => {
    await expect(handler({ key: 'api', runs: 1.5, projectRoot: '/p', configRoot: '/p' }))
      .rejects.toThrow('process.exit(1)')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('does not exit when --runs is 1', async () => {
    loadConfig.mockReturnValue({ runes: { api: { path: 'runes/api.js' } } })
    runRune.mockResolvedValue([{ name: 'out', data: { type: 'markdown', content: 'x' } }])
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(handler({ key: 'api', runs: 1, plain: true, projectRoot: '/p', configRoot: '/p' }))
      .resolves.toBeUndefined()
    expect(exitSpy).not.toHaveBeenCalled()
  })
})

describe('handler — key required', () => {
  let exitSpy

  beforeEach(() => {
    loadConfig.mockReturnValue({ runes: {} })
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks() })

  it('exits 1 when key is missing', async () => {
    await expect(handler({ key: null, runeArgs: [], projectRoot: '/p', configRoot: '/p' }))
      .rejects.toThrow('process.exit(1)')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})

describe('handler — runeArgs', () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({ runes: { myrune: { path: 'runes/myrune.js' } } })
    runRune.mockResolvedValue(MINIMAL_SECTION)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit(${code})`) })
  })

  afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks() })

  it('passes runeArgs to runRune', async () => {
    await handler({ key: 'myrune', runeArgs: ['--foo', 'bar'], runs: 1, plain: true, projectRoot: '/p', configRoot: '/p' })
    expect(runRune).toHaveBeenCalledWith('/p', expect.anything(), 'myrune', ['--foo', 'bar'], expect.anything())
  })

  it('passes empty runeArgs when none given', async () => {
    await handler({ key: 'myrune', runeArgs: [], runs: 1, plain: true, projectRoot: '/p', configRoot: '/p' })
    expect(runRune).toHaveBeenCalledWith('/p', expect.anything(), 'myrune', [], expect.anything())
  })

  it('uses key directly for runRune', async () => {
    await handler({ key: 'myrune', runeArgs: [], runs: 1, plain: true, projectRoot: '/p', configRoot: '/p' })
    expect(runRune.mock.calls[0][2]).toBe('myrune')
  })
})

describe('handler — warmup', () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({ runes: { myrune: { path: 'runes/myrune.js' } } })
    runRune.mockResolvedValue(MINIMAL_SECTION)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit(${code})`) })
  })

  afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks() })

  it('skips warmup run by default', async () => {
    await handler({ key: 'myrune', runeArgs: [], runs: 1, plain: true, projectRoot: '/p', configRoot: '/p' })
    expect(runRune).toHaveBeenCalledTimes(1)
  })

  it('adds one extra warmup call when warmup=true', async () => {
    await handler({ key: 'myrune', runeArgs: [], runs: 1, warmup: true, plain: true, projectRoot: '/p', configRoot: '/p' })
    expect(runRune).toHaveBeenCalledTimes(2)
  })

  it('warmup call uses same runeArgs as timed runs', async () => {
    await handler({ key: 'myrune', runeArgs: ['--foo'], runs: 1, warmup: true, plain: true, projectRoot: '/p', configRoot: '/p' })
    for (const call of runRune.mock.calls) {
      expect(call[3]).toEqual(['--foo'])
    }
  })
})
