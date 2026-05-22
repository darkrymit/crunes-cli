import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../src/core/config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../../src/rune/resolver.js', () => ({ runRune: vi.fn(), getRune: vi.fn() }))

import { loadConfig } from '../../../src/core/config.js'
import { runRune } from '../../../src/rune/resolver.js'
import { handler, parseBenchArgs } from '../../../src/rune/commands/benchmark.js'

const MINIMAL_SECTION = [{ name: 'out', data: { type: 'markdown', content: 'x' } }]

describe('parseBenchArgs', () => {
  it('parses bare key with defaults', () => {
    expect(parseBenchArgs(['api'])).toMatchObject({ key: 'api', runeArgs: [], runs: 1, warmup: false })
  })

  it('extracts --runs value as integer', () => {
    expect(parseBenchArgs(['--runs', '5', 'api']).runs).toBe(5)
  })

  it('extracts --warmup flag', () => {
    expect(parseBenchArgs(['--warmup', 'api']).warmup).toBe(true)
  })

  it('passes rune args through verbatim after key', () => {
    expect(parseBenchArgs(['api', '--verbose', '--flag', 'v']).runeArgs).toEqual(['--verbose', '--flag', 'v'])
  })

  it('returns null key for empty argv', () => {
    expect(parseBenchArgs([]).key).toBeNull()
  })

  it('handles --runs=N inline form', () => {
    expect(parseBenchArgs(['--runs=3', 'api']).runs).toBe(3)
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
