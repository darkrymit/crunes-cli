import { describe, it, expect, vi } from 'vitest'
import { createYamlUtils } from '../../../src/rune/api/yaml.js'

function makeFsUtils(files = {}) {
  const store = { ...files }
  return {
    read: vi.fn(async (relPath, opts = {}) => {
      if (relPath in store) return store[relPath]
      if (opts.throw === false) return null
      const err = new Error(`ENOENT: ${relPath}`)
      err.code = 'ENOENT'
      throw err
    }),
    exists: vi.fn(async (relPath) => relPath in store),
    write: vi.fn(async (relPath, content) => { store[relPath] = content }),
  }
}

describe('yaml.read', () => {
  it('parses valid YAML', async () => {
    const fsUtils = makeFsUtils({ 'values.yaml': 'replicas: 3\nimage: app:latest\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    expect(await yaml.read('values.yaml')).toEqual({ replicas: 3, image: 'app:latest' })
  })

  it('returns null when file not found and throw:false', async () => {
    const fsUtils = makeFsUtils({})
    const yaml = createYamlUtils('/project', fsUtils)
    expect(await yaml.read('missing.yaml', { throw: false })).toBeNull()
  })

  it('throws when file not found and throw:true (default)', async () => {
    const fsUtils = makeFsUtils({})
    const yaml = createYamlUtils('/project', fsUtils)
    await expect(yaml.read('missing.yaml')).rejects.toThrow('ENOENT')
  })

  it('throws YamlParseError with file path on invalid YAML', async () => {
    const fsUtils = makeFsUtils({ 'bad.yaml': 'a: {unclosed' })
    const yaml = createYamlUtils('/project', fsUtils)
    const err = await yaml.read('bad.yaml').catch(e => e)
    expect(err.name).toBe('YamlParseError')
    expect(err.message).toContain('bad.yaml')
  })

  it('includes line and column in YamlParseError when available', async () => {
    const fsUtils = makeFsUtils({ 'bad.yaml': 'a: {unclosed' })
    const yaml = createYamlUtils('/project', fsUtils)
    const err = await yaml.read('bad.yaml').catch(e => e)
    expect(err.name).toBe('YamlParseError')
    expect(err.message).toMatch(/line \d+, column \d+/)
  })
})

describe('yaml.write', () => {
  it('serializes data to YAML with 2-space indent by default', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.write('values.yaml', { replicas: 3, image: 'app:latest' })
    expect(fsUtils.write).toHaveBeenCalledWith(
      'values.yaml',
      'replicas: 3\nimage: app:latest\n'
    )
  })

  it('uses custom indent when provided', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.write('config.yaml', { a: { b: 1 } }, { indent: 4 })
    expect(fsUtils.write).toHaveBeenCalledWith(
      'config.yaml',
      'a:\n    b: 1\n'
    )
  })

  it('always ends with a trailing newline', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.write('a.yaml', { x: 1 })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content.endsWith('\n')).toBe(true)
  })

  it('passes the filepath through to fsUtils.write unchanged', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.write('nested/config.yaml', { key: 'value' })
    expect(fsUtils.write.mock.calls[0][0]).toBe('nested/config.yaml')
  })
})

describe('yaml.modify', () => {
  it('calls callback with parsed data and { exists: true } when file exists', async () => {
    const fsUtils = makeFsUtils({ 'values.yaml': 'replicas: 3\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    let capturedData, capturedCtx
    await yaml.modify('values.yaml', async (data, ctx) => {
      capturedData = structuredClone(data)
      capturedCtx = ctx
    })
    expect(capturedData).toEqual({ replicas: 3 })
    expect(capturedCtx).toEqual({ exists: true })
  })

  it('writes the mutated argument when callback returns undefined', async () => {
    const fsUtils = makeFsUtils({ 'values.yaml': 'replicas: 3\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.modify('values.yaml', async (data) => { data.replicas = 5 })
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toContain('replicas: 5')
  })

  it('writes the returned object when callback returns a non-undefined value', async () => {
    const fsUtils = makeFsUtils({ 'values.yaml': 'replicas: 3\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.modify('values.yaml', async (data) => ({ ...data, image: 'app:v2' }))
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toContain('image: app:v2')
    expect(written).toContain('replicas: 3')
  })

  it('uses initial value when file is missing and initial provided', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    let capturedCtx
    await yaml.modify('config.yaml', async (data, ctx) => {
      capturedCtx = ctx
      data.enabled = true
    }, { initial: {} })
    expect(capturedCtx).toEqual({ exists: false })
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toContain('enabled: true')
  })

  it('does not mutate the caller\'s initial object', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    const initial = { x: 1 }
    await yaml.modify('config.yaml', async (data) => { data.y = 2 }, { initial })
    expect(initial).toEqual({ x: 1 })
  })

  it('throws ENOENT when file is missing and no initial provided', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    await expect(yaml.modify('missing.yaml', async () => {})).rejects.toThrow('ENOENT')
  })

  it('propagates YamlParseError for invalid YAML', async () => {
    const fsUtils = makeFsUtils({ 'bad.yaml': 'a: {unclosed' })
    const yaml = createYamlUtils('/project', fsUtils)
    const err = await yaml.modify('bad.yaml', async () => {}).catch(e => e)
    expect(err.name).toBe('YamlParseError')
  })

  it('passes the indent option through to write', async () => {
    const fsUtils = makeFsUtils({ 'a.yaml': 'a:\n  b: 1\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.modify('a.yaml', async (d) => { d.a.c = 2 }, { indent: 4 })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toContain('    b: 1')
  })
})
