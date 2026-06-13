import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../src/core/config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../../src/rune/resolver.js', () => ({ runRune: vi.fn() }))

import { loadConfig } from '../../../src/core/config.js'
import { runRune } from '../../../src/rune/resolver.js'
import { handler, parseSegment, parseRunArgs } from '../../../src/rune/commands/run.js'

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

  it('-- before key: skips --, treats next token as key', () => {
    expect(parseSegment(['--', 'api', '--format', 'json']))
      .toEqual({ key: 'api', sections: null, runeArgs: ['--format', 'json'] })
  })

  it('-- before key after --section', () => {
    expect(parseSegment(['--section', 'x', '--', 'api', '--flag']))
      .toEqual({ key: 'api', sections: ['x'], runeArgs: ['--flag'] })
  })

  it('-- after key strips from runeArgs', () => {
    expect(parseSegment(['api', '--', '--format', 'json']))
      .toEqual({ key: 'api', sections: null, runeArgs: ['--format', 'json'] })
  })

  it('-- after key with no args after it', () => {
    expect(parseSegment(['api', '--']))
      .toEqual({ key: 'api', sections: null, runeArgs: [] })
  })

  it('-- after key after --section', () => {
    expect(parseSegment(['--section', 'x', 'api', '--', '--flag']))
      .toEqual({ key: 'api', sections: ['x'], runeArgs: ['--flag'] })
  })

  it('-- not first runeArg is passed through verbatim', () => {
    expect(parseSegment(['api', '--flag', '--', 'val']))
      .toEqual({ key: 'api', sections: null, runeArgs: ['--flag', '--', 'val'] })
  })

  it('throws an error and exits if the resolved key starts with a hyphen', async () => {
    const { output } = await import('../../../src/shared/output.js')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    const errorSpy = vi.spyOn(output, 'error').mockImplementation(() => {})
    const infoSpy = vi.spyOn(output, 'info').mockImplementation(() => {})
    
    parseSegment(['--cwd', 'foo'])
    
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown option or misplaced flag: "--cwd"'))
    expect(exitSpy).toHaveBeenCalledWith(1)
    
    exitSpy.mockRestore()
    errorSpy.mockRestore()
    infoSpy.mockRestore()
  })
})

describe('parseRunArgs', () => {
  it('parses single bare key', () => {
    expect(parseRunArgs(['api'])).toEqual({
      segments: [{ key: 'api', sections: null, runeArgs: [] }],
      format: 'text',
      failFast: false,
      isBatch: false,
    })
  })

  it('extracts --format before key', () => {
    const result = parseRunArgs(['--format', 'jsonl', 'api'])
    expect(result.format).toBe('jsonl')
    expect(result.segments[0]).toEqual({ key: 'api', sections: null, runeArgs: [] })
  })

  it('extracts --fail-fast', () => {
    expect(parseRunArgs(['--fail-fast', 'api']).failFast).toBe(true)
  })

  it('passes rune flags through after key', () => {
    const result = parseRunArgs(['api', '--verbose', '--flag', 'val'])
    expect(result.segments[0].runeArgs).toEqual(['--verbose', '--flag', 'val'])
  })

  it('requires -b to split on bare + into multiple segments', () => {
    const result = parseRunArgs(['-b', 'api', '+', 'git', '+', 'env'])
    expect(result.segments).toHaveLength(3)
    expect(result.segments.map(s => s.key)).toEqual(['api', 'git', 'env'])
  })

  it('treats + as literal argument when -b is missing', () => {
    const result = parseRunArgs(['api', '+', 'git'])
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].key).toBe('api')
    expect(result.segments[0].runeArgs).toEqual(['+', 'git'])
  })

  it('per-segment --section is isolated to its segment', () => {
    const result = parseRunArgs(['-b', '--section', 'endpoints', 'api', '+', 'git'])
    expect(result.segments[0].sections).toEqual(['endpoints'])
    expect(result.segments[1].sections).toBeNull()
  })

  it('rune args in first segment do not bleed into second', () => {
    const result = parseRunArgs(['-b', 'api', '--rune-flag', '+', 'git'])
    expect(result.segments[0].runeArgs).toEqual(['--rune-flag'])
    expect(result.segments[1].runeArgs).toEqual([])
  })

  it('+ token inside rune args is treated as literal (not a separator)', () => {
    const result = parseRunArgs(['api', '--tag=a+b'])
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].runeArgs).toEqual(['--tag=a+b'])
  })

  it('defaults format to text and failFast to false', () => {
    const result = parseRunArgs(['api'])
    expect(result.format).toBe('text')
    expect(result.failFast).toBe(false)
    expect(result.isBatch).toBe(false)
  })

  it('sets isBatch true when -b flag present', () => {
    const result = parseRunArgs(['-b', 'api', '+', 'git'])
    expect(result.isBatch).toBe(true)
  })

  it('does not intercept --format after the key — passes it to runeArgs', () => {
    const result = parseRunArgs(['api', '--format', 'jsonl'])
    expect(result.format).toBe('text')
    expect(result.segments[0].runeArgs).toEqual(['--format', 'jsonl'])
  })

  it('does not intercept --fail-fast after the key — passes it to runeArgs', () => {
    const result = parseRunArgs(['api', '--fail-fast'])
    expect(result.failFast).toBe(false)
    expect(result.segments[0].runeArgs).toEqual(['--fail-fast'])
  })

  it('treats -- as end of run-flags, strips it, passes nothing to segments', () => {
    const result = parseRunArgs(['--format', 'jsonl', '--', 'api'])
    expect(result.format).toBe('jsonl')
    expect(result.segments[0].key).toBe('api')
    expect(result.segments[0].runeArgs).toEqual([])
  })

  it('strips -- before key, rune args follow normally', () => {
    const result = parseRunArgs(['--', 'api', '--format', 'json'])
    expect(result.format).toBe('text')
    expect(result.segments[0].key).toBe('api')
    expect(result.segments[0].runeArgs).toEqual(['--format', 'json'])
  })

  it('strips -- in batch — each segment still split by +', () => {
    const result = parseRunArgs(['-b', '--', 'api', '--flag', '+', 'git'])
    expect(result.isBatch).toBe(true)
    expect(result.segments[0].key).toBe('api')
    expect(result.segments[0].runeArgs).toEqual(['--flag'])
    expect(result.segments[1].key).toBe('git')
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
    await handler({ segments: [{ key: 'docs', sections: null, runeArgs: [] }], format: 'jsonl' })
    const events = written.split('\n').filter(Boolean).map(JSON.parse)
    expect(events).toHaveLength(2)
    expect(events.map(e => e.section.name)).toEqual(['intro', 'detail'])
  })

  it('exact name filter keeps matching section', async () => {
    runRune.mockResolvedValue(makeSections('endpoints', 'errors'))
    let written = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { written += s })
    await handler({ segments: [{ key: 'docs', sections: ['endpoints'], runeArgs: [] }], format: 'jsonl' })
    const events = written.split('\n').filter(Boolean).map(JSON.parse)
    expect(events).toHaveLength(1)
    expect(events[0].section.name).toBe('endpoints')
  })

  it('glob filter matches prefix', async () => {
    runRune.mockResolvedValue(makeSections('api-auth', 'api-users', 'errors'))
    let written = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { written += s })
    await handler({ segments: [{ key: 'docs', sections: ['api-*'], runeArgs: [] }], format: 'jsonl' })
    const events = written.split('\n').filter(Boolean).map(JSON.parse)
    expect(events.map(e => e.section.name)).toEqual(['api-auth', 'api-users'])
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
      format: 'jsonl',
    })
    const events = written.split('\n').filter(Boolean).map(JSON.parse)
    expect(events.map(e => e.section.name)).toEqual(['a', 'b'])
  })
})

describe('handler — progressive streaming and console logs', () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({ runes: { docs: { path: 'runes/docs.js' } } })
    vi.spyOn(process.stdout, 'write').mockImplementation(() => {})
    vi.spyOn(process.stderr, 'write').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(() => {})
  })

  afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks() })

  it('outputs console logs progressively and formats as JSON Lines', async () => {
    runRune.mockImplementation(async (dir, config, key, args, opts) => {
      opts.onEvent({ type: 'log', level: 'log', message: 'started' })
      opts.onEvent({ type: 'log', level: 'error', message: 'warning' })
      opts.onEvent({ type: 'section', section: { name: 'sec1', data: { type: 'markdown', content: 'c1' } } })
      return [{ name: 'sec2', data: { type: 'markdown', content: 'c2' } }]
    })

    let stdoutWritten = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { stdoutWritten += s })

    await handler({ segments: [{ key: 'docs', sections: null, runeArgs: [] }], format: 'jsonl' })
    
    const lines = stdoutWritten.split('\n').filter(Boolean).map(JSON.parse)
    expect(lines).toHaveLength(4)
    expect(lines[0]).toMatchObject({ type: 'log', level: 'log', message: 'started' })
    expect(lines[1]).toMatchObject({ type: 'log', level: 'error', message: 'warning' })
    expect(lines[2]).toEqual({ type: 'section', section: { name: 'sec1', data: { type: 'markdown', content: 'c1' } } })
    expect(lines[3]).toEqual({
      type: 'section',
      rune: 'docs',
      instance: '1',
      section: { name: 'sec2', data: { type: 'markdown', content: 'c2' } }
    })
  })

  it('log event with level renders [instanceId:rune:log:level] prefix in text mode', async () => {
    runRune.mockImplementation(async (dir, config, key, args, opts) => {
      opts.onEvent({ type: 'log', level: 'info', message: 'hello', rune: 'docs', instanceId: '1' })
      return []
    })
    let stdoutWritten = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { stdoutWritten += s })
    await handler({ segments: [{ key: 'docs', sections: null, runeArgs: [] }], format: 'text' })
    expect(stdoutWritten).toContain('[1:docs:log:info] hello')
  })

  it('log event with meta appends attrs in text mode', async () => {
    runRune.mockImplementation(async (dir, config, key, args, opts) => {
      opts.onEvent({ type: 'log', level: 'warn', message: 'slow', meta: { ms: 1200 }, rune: 'docs', instanceId: '1' })
      return []
    })
    let stdoutWritten = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { stdoutWritten += s })
    await handler({ segments: [{ key: 'docs', sections: null, runeArgs: [] }], format: 'text' })
    expect(stdoutWritten).toContain('[1:docs:log:warn] slow [ms: 1200]')
  })

  it('log event with level and meta emits structured JSONL', async () => {
    runRune.mockImplementation(async (dir, config, key, args, opts) => {
      opts.onEvent({ type: 'log', level: 'debug', message: 'trace', meta: { key: 'foo' }, rune: 'docs', instanceId: '1' })
      return []
    })
    let stdoutWritten = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { stdoutWritten += s })
    await handler({ segments: [{ key: 'docs', sections: null, runeArgs: [] }], format: 'jsonl' })
    const lines = stdoutWritten.split('\n').filter(Boolean).map(JSON.parse)
    const logLine = lines.find(l => l.type === 'log')
    expect(logLine).toMatchObject({ type: 'log', level: 'debug', message: 'trace', meta: { key: 'foo' } })
  })

  it('filters progressive JSONL section events when section filter is present', async () => {
    runRune.mockImplementation(async (dir, config, key, args, opts) => {
      opts.onEvent({ type: 'section', section: { name: 'matching-sec', data: { type: 'markdown', content: 'c1' } } })
      opts.onEvent({ type: 'section', section: { name: 'other-sec', data: { type: 'markdown', content: 'c2' } } })
      return []
    })

    let stdoutWritten = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { stdoutWritten += s })

    await handler({ segments: [{ key: 'docs', sections: ['matching-sec'], runeArgs: [] }], format: 'jsonl' })

    const lines = stdoutWritten.split('\n').filter(Boolean).map(JSON.parse)
    expect(lines).toHaveLength(1)
    expect(lines[0].section.name).toBe('matching-sec')
  })

  it('harmonizes final section JSONL output schema with metadata keys', async () => {
    runRune.mockResolvedValue([{ name: 'finalSec', data: { type: 'markdown', content: 'hello' } }])
    
    let written = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { written += s })
    
    await handler({ segments: [{ key: 'docs', sections: null, runeArgs: [] }], format: 'jsonl' })
    
    const events = written.split('\n').filter(Boolean).map(JSON.parse)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      type: 'section',
      rune: 'docs',
      instance: '1',
      section: { name: 'finalSec', data: { type: 'markdown', content: 'hello' } }
    })
  })
})

describe('handler — early gating of empty keys', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit(${code})`) })
  })

  afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks() })

  it('exits 1 and prints early gating error when key is missing', async () => {
    const { output } = await import('../../../src/shared/output.js')
    const errorSpy = vi.spyOn(output, 'error').mockImplementation(() => {})
    
    await expect(handler({
      segments: [{ key: null, sections: null, runeArgs: [] }],
      format: 'text',
      failFast: false
    })).rejects.toThrow('exit(1)')

    expect(errorSpy).toHaveBeenCalledWith('Missing required argument: <rune>')
    errorSpy.mockRestore()
  })
})

describe('handler — batch permission enforcement', () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({
      runes: {
        docs:    { batch: { allow: ['*'] } },
        release: { batch: { allow: ['info*'] } },
        deploy:  {},
      }
    })
    runRune.mockResolvedValue([])
  })

  afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks() })

  it('allows batched rune when allow wildcard matches', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    await handler({ segments: [{ key: 'docs', runeArgs: [], sections: null }], format: 'text', isBatch: true })
    expect(exitSpy).not.toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('allows batched rune when allow prefix matches args', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    await handler({ segments: [{ key: 'release', runeArgs: ['info', '--verbose'], sections: null }], format: 'text', isBatch: true })
    expect(exitSpy).not.toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('denies batch and exits 1 when no batch block declared', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    const { output } = await import('../../../src/shared/output.js')
    const errorSpy = vi.spyOn(output, 'error').mockImplementation(() => {})
    await handler({ segments: [{ key: 'deploy', runeArgs: [], sections: null }], format: 'text', isBatch: true })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Batch not permitted for "deploy"'))
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('denies batch when allow prefix does not match args', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    const { output } = await import('../../../src/shared/output.js')
    const errorSpy = vi.spyOn(output, 'error').mockImplementation(() => {})
    await handler({ segments: [{ key: 'release', runeArgs: ['bump', '--minor'], sections: null }], format: 'text', isBatch: true })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Batch not permitted for "release bump --minor"'))
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('denies entire batch if any one segment is denied — nothing runs', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit(1)') })
    const { output } = await import('../../../src/shared/output.js')
    vi.spyOn(output, 'error').mockImplementation(() => {})
    await expect(handler({
      segments: [
        { key: 'docs',   runeArgs: [], sections: null },
        { key: 'deploy', runeArgs: [], sections: null },
      ],
      format: 'text',
      isBatch: true,
    })).rejects.toThrow('exit(1)')
    expect(runRune).not.toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('does not check batch permission for single-rune invocation', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    await handler({ segments: [{ key: 'deploy', runeArgs: [], sections: null }], format: 'text', isBatch: false })
    expect(runRune).toHaveBeenCalled()
    exitSpy.mockRestore()
  })
})

