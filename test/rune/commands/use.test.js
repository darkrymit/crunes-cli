import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../src/core/config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../../src/rune/resolver.js', () => ({ runRune: vi.fn() }))

import { loadConfig } from '../../../src/core/config.js'
import { runRune } from '../../../src/rune/resolver.js'
import { handler, parseSegment, parseUseArgs } from '../../../src/rune/commands/use.js'

describe('parseSegment', () => {
  it('parses bare key', () => {
    expect(parseSegment(['api'])).toEqual({ key: 'api', sections: null, runeArgs: [] })
  })

  it('passes rune flags through verbatim after key', () => {
    expect(parseSegment(['api', '--format', 'json', '--verbose']))
      .toEqual({ key: 'api', sections: null, runeArgs: ['--format', 'json', '--verbose'] })
  })

  it('consumes --section before key', () => {
    expect(parseSegment(['--section', 'endpoints', 'api']))
      .toEqual({ key: 'api', sections: ['endpoints'], runeArgs: [] })
  })

  it('consumes -s shorthand before key', () => {
    expect(parseSegment(['-s', 'endpoints', 'api']))
      .toEqual({ key: 'api', sections: ['endpoints'], runeArgs: [] })
  })

  it('splits comma-separated section values', () => {
    expect(parseSegment(['--section', 's1,s2', 'api']))
      .toEqual({ key: 'api', sections: ['s1', 's2'], runeArgs: [] })
  })

  it('does NOT consume --section that appears after the key', () => {
    expect(parseSegment(['api', '--section', 'x']))
      .toEqual({ key: 'api', sections: null, runeArgs: ['--section', 'x'] })
  })

  it('returns null key for empty argv', () => {
    expect(parseSegment([])).toEqual({ key: null, sections: null, runeArgs: [] })
  })

  it('handles --section with key and rune args', () => {
    expect(parseSegment(['--section', 'layout', 'api', '--flag', 'val']))
      .toEqual({ key: 'api', sections: ['layout'], runeArgs: ['--flag', 'val'] })
  })
})

describe('parseUseArgs', () => {
  it('parses single bare key', () => {
    expect(parseUseArgs(['api'])).toEqual({
      segments: [{ key: 'api', sections: null, runeArgs: [] }],
      format: 'md',
      failFast: false,
    })
  })

  it('extracts --format before key', () => {
    const result = parseUseArgs(['--format', 'json', 'api'])
    expect(result.format).toBe('json')
    expect(result.segments[0]).toEqual({ key: 'api', sections: null, runeArgs: [] })
  })

  it('extracts --fail-fast', () => {
    expect(parseUseArgs(['--fail-fast', 'api']).failFast).toBe(true)
  })

  it('passes rune flags through after key', () => {
    const result = parseUseArgs(['api', '--verbose', '--flag', 'val'])
    expect(result.segments[0].runeArgs).toEqual(['--verbose', '--flag', 'val'])
  })

  it('splits on bare + into multiple segments', () => {
    const result = parseUseArgs(['api', '+', 'git', '+', 'env'])
    expect(result.segments).toHaveLength(3)
    expect(result.segments.map(s => s.key)).toEqual(['api', 'git', 'env'])
  })

  it('per-segment --section is isolated to its segment', () => {
    const result = parseUseArgs(['--section', 'endpoints', 'api', '+', 'git'])
    expect(result.segments[0].sections).toEqual(['endpoints'])
    expect(result.segments[1].sections).toBeNull()
  })

  it('rune args in first segment do not bleed into second', () => {
    const result = parseUseArgs(['api', '--rune-flag', '+', 'git'])
    expect(result.segments[0].runeArgs).toEqual(['--rune-flag'])
    expect(result.segments[1].runeArgs).toEqual([])
  })

  it('+ token inside rune args is treated as literal (not a separator)', () => {
    const result = parseUseArgs(['api', '--tag=a+b'])
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].runeArgs).toEqual(['--tag=a+b'])
  })

  it('defaults format to md and failFast to false', () => {
    const result = parseUseArgs(['api'])
    expect(result.format).toBe('md')
    expect(result.failFast).toBe(false)
  })

  it('does not intercept --format after the key — passes it to runeArgs', () => {
    const result = parseUseArgs(['api', '--format', 'json'])
    expect(result.format).toBe('md')
    expect(result.segments[0].runeArgs).toEqual(['--format', 'json'])
  })

  it('does not intercept --fail-fast after the key — passes it to runeArgs', () => {
    const result = parseUseArgs(['api', '--fail-fast'])
    expect(result.failFast).toBe(false)
    expect(result.segments[0].runeArgs).toEqual(['--fail-fast'])
  })
})

describe('handler — configRoot', () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({ runes: { docs: { path: 'runes/docs.js' } } })
    vi.spyOn(process.stdout, 'write').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(() => {})
    runRune.mockResolvedValue([])
  })

  afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks() })

  it('loads config from configRoot when it differs from projectRoot', async () => {
    await handler({ segments: [{ key: 'docs', sections: null, runeArgs: [] }], projectRoot: '/project', configRoot: '/config-repo' })
    expect(loadConfig).toHaveBeenCalledWith('/config-repo')
  })

  it('passes configDir to runRune when configRoot is set', async () => {
    await handler({ segments: [{ key: 'docs', sections: null, runeArgs: [] }], projectRoot: '/project', configRoot: '/config-repo' })
    expect(runRune).toHaveBeenCalledWith(
      '/project',
      expect.anything(),
      'docs',
      [],
      expect.objectContaining({ configDir: '/config-repo' })
    )
  })

  it('falls back to projectRoot for configRoot when not provided', async () => {
    await handler({ segments: [{ key: 'docs', sections: null, runeArgs: [] }], projectRoot: '/project' })
    expect(loadConfig).toHaveBeenCalledWith('/project')
  })
})

describe('handler — section filtering', () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({ runes: { docs: { path: 'runes/docs.js' } } })
    vi.spyOn(process.stdout, 'write').mockImplementation(s => {})
    vi.spyOn(process, 'exit').mockImplementation(() => {})
  })

  afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks() })

  const makeSections = (...names) =>
    names.map(name => ({ name, title: undefined, attrs: {}, data: { type: 'markdown', content: name } }))

  it('passes all sections when no filter given', async () => {
    runRune.mockResolvedValue(makeSections('intro', 'detail'))
    let written = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { written += s })
    await handler({ segments: [{ key: 'docs', sections: null, runeArgs: [] }], format: 'json' })
    expect(JSON.parse(written)).toHaveLength(2)
  })

  it('exact name filter keeps matching section', async () => {
    runRune.mockResolvedValue(makeSections('endpoints', 'errors'))
    let written = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { written += s })
    await handler({ segments: [{ key: 'docs', sections: ['endpoints'], runeArgs: [] }], format: 'json' })
    const sections = JSON.parse(written)
    expect(sections).toHaveLength(1)
    expect(sections[0].name).toBe('endpoints')
  })

  it('glob filter matches prefix', async () => {
    runRune.mockResolvedValue(makeSections('api-auth', 'api-users', 'errors'))
    let written = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { written += s })
    await handler({ segments: [{ key: 'docs', sections: ['api-*'], runeArgs: [] }], format: 'json' })
    const sections = JSON.parse(written)
    expect(sections.map(s => s.name)).toEqual(['api-auth', 'api-users'])
  })

  it('passes rune args to runRune verbatim', async () => {
    runRune.mockResolvedValue([])
    await handler({ segments: [{ key: 'docs', sections: null, runeArgs: ['--flag', 'val'] }] })
    expect(runRune).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'docs', ['--flag', 'val'], expect.anything()
    )
  })

  it('batches multiple segments in order', async () => {
    runRune
      .mockResolvedValueOnce(makeSections('a'))
      .mockResolvedValueOnce(makeSections('b'))
    let written = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { written += s })
    await handler({
      segments: [
        { key: 'docs', sections: null, runeArgs: [] },
        { key: 'git', sections: null, runeArgs: [] },
      ],
      format: 'json',
    })
    expect(JSON.parse(written).map(s => s.name)).toEqual(['a', 'b'])
  })
})
