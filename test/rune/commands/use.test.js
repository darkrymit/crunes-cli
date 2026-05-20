import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../src/core/config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../../src/rune/resolver.js', () => ({ runRune: vi.fn() }))

import { loadConfig } from '../../../src/core/config.js'
import { runRune } from '../../../src/rune/resolver.js'
import { handler, parseKeyToken } from '../../../src/rune/commands/use.js'

describe('parseKeyToken', () => {
  it('parses bare key', () => {
    expect(parseKeyToken('docs')).toEqual({ key: 'docs', args: [], sections: null })
  })

  it('parses key with exact section filter', () => {
    expect(parseKeyToken('docs::endpoints')).toEqual({ key: 'docs', args: [], sections: ['endpoints'] })
  })

  it('parses key with glob section filter', () => {
    expect(parseKeyToken('docs::api-*')).toEqual({ key: 'docs', args: [], sections: ['api-*'] })
  })

  it('parses combined glob and exact patterns', () => {
    expect(parseKeyToken('docs::api-*,errors')).toEqual({ key: 'docs', args: [], sections: ['api-*', 'errors'] })
  })

  it('parses key with args and section filter', () => {
    expect(parseKeyToken('docs=v2::api-*')).toEqual({ key: 'docs', args: ['v2'], sections: ['api-*'] })
  })
})

describe('handler configRoot', () => {
  let written

  beforeEach(() => {
    loadConfig.mockReturnValue({ runes: { docs: { path: 'runes/docs.js' } } })
    written = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { written += s })
    vi.spyOn(process, 'exit').mockImplementation(() => {})
    runRune.mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('loads config from configRoot when it differs from projectRoot', async () => {
    await handler({ keys: ['docs'], projectRoot: '/project', configRoot: '/config-repo' })
    expect(loadConfig).toHaveBeenCalledWith('/config-repo')
  })

  it('passes configDir to runRune when configRoot is set', async () => {
    await handler({ keys: ['docs'], projectRoot: '/project', configRoot: '/config-repo' })
    expect(runRune).toHaveBeenCalledWith(
      '/project',
      expect.anything(),
      'docs',
      [],
      expect.objectContaining({ configDir: '/config-repo' })
    )
  })

  it('falls back to projectRoot for configRoot when not provided', async () => {
    await handler({ keys: ['docs'], projectRoot: '/project' })
    expect(loadConfig).toHaveBeenCalledWith('/project')
  })
})

describe('handler section filtering', () => {
  let written

  beforeEach(() => {
    loadConfig.mockReturnValue({ runes: { docs: { path: 'runes/docs.js' } } })
    written = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(s => { written += s })
    vi.spyOn(process, 'exit').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  const makeSections = (...names) =>
    names.map(name => ({ name, title: undefined, attrs: {}, data: { type: 'markdown', content: name } }))

  it('passes all sections when no filter given', async () => {
    runRune.mockResolvedValue(makeSections('intro', 'detail'))
    await handler({ keys: ['docs'], format: 'json' })
    expect(JSON.parse(written)).toHaveLength(2)
  })

  it('exact name filter is backward compatible', async () => {
    runRune.mockResolvedValue(makeSections('endpoints', 'errors'))
    await handler({ keys: ['docs::endpoints'], format: 'json' })
    const sections = JSON.parse(written)
    expect(sections).toHaveLength(1)
    expect(sections[0].name).toBe('endpoints')
  })

  it('glob filter matches prefix', async () => {
    runRune.mockResolvedValue(makeSections('api-auth', 'api-users', 'errors'))
    await handler({ keys: ['docs::api-*'], format: 'json' })
    const sections = JSON.parse(written)
    expect(sections.map(s => s.name)).toEqual(['api-auth', 'api-users'])
  })

  it('wildcard passes all sections through', async () => {
    runRune.mockResolvedValue(makeSections('a', 'b', 'c'))
    await handler({ keys: ['docs::*'], format: 'json' })
    expect(JSON.parse(written)).toHaveLength(3)
  })

  it('combined glob and exact filter matches both', async () => {
    runRune.mockResolvedValue(makeSections('api-auth', 'api-users', 'errors', 'other'))
    await handler({ keys: ['docs::api-*,errors'], format: 'json' })
    const sections = JSON.parse(written)
    expect(sections.map(s => s.name)).toEqual(['api-auth', 'api-users', 'errors'])
  })
})
