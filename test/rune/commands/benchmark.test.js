import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../src/core/config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../../src/rune/resolver.js', () => ({ runRune: vi.fn(), getRune: vi.fn() }))

import { loadConfig } from '../../../src/core/config.js'
import { runRune } from '../../../src/rune/resolver.js'
import { handler } from '../../../src/rune/commands/benchmark.js'

const MINIMAL_SECTION = [{ name: 'out', data: { type: 'markdown', content: 'x' } }]

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
    await expect(handler({ projectRoot: '/p', configRoot: '/p' }))
      .rejects.toThrow('process.exit(1)')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})

describe('handler — token parsing', () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({ runes: { myrune: { path: 'runes/myrune.js' } } })
    runRune.mockResolvedValue(MINIMAL_SECTION)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit(${code})`) })
  })

  afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks() })

  it('passes parsed args from token to runRune', async () => {
    await handler({ key: 'myrune=foo,bar', runs: 1, plain: true, projectRoot: '/p', configRoot: '/p' })
    expect(runRune).toHaveBeenCalledWith('/p', expect.anything(), 'myrune', ['foo', 'bar'], expect.anything())
  })

  it('passes empty args for bare key', async () => {
    await handler({ key: 'myrune', runs: 1, plain: true, projectRoot: '/p', configRoot: '/p' })
    expect(runRune).toHaveBeenCalledWith('/p', expect.anything(), 'myrune', [], expect.anything())
  })

  it('uses parsed key (not raw token) for runRune', async () => {
    await handler({ key: 'myrune=somearg', runs: 1, plain: true, projectRoot: '/p', configRoot: '/p' })
    const [, , calledKey] = runRune.mock.calls[0]
    expect(calledKey).toBe('myrune')
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
    await handler({ key: 'myrune', runs: 1, plain: true, projectRoot: '/p', configRoot: '/p' })
    expect(runRune).toHaveBeenCalledTimes(1)
  })

  it('adds one extra warmup call when warmup=true', async () => {
    await handler({ key: 'myrune', runs: 1, warmup: true, plain: true, projectRoot: '/p', configRoot: '/p' })
    expect(runRune).toHaveBeenCalledTimes(2)
  })

  it('warmup call uses same parsed args as timed runs', async () => {
    await handler({ key: 'myrune=foo', runs: 1, warmup: true, plain: true, projectRoot: '/p', configRoot: '/p' })
    for (const call of runRune.mock.calls) {
      expect(call[3]).toEqual(['foo'])
    }
  })
})
