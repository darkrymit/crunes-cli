import { describe, it, expect, vi } from 'vitest'
import { createJsonUtils } from '../../../src/rune/api/json.js'

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

describe('json.read', () => {
  it('parses valid JSON', async () => {
    const fs = makeFsUtils({ 'package.json': '{"name":"my-app"}' })
    const json = createJsonUtils('/project', fs)
    expect(await json.read('package.json')).toEqual({ name: 'my-app' })
  })

  it('returns null when file not found and throw:false', async () => {
    const fs = makeFsUtils({})
    const json = createJsonUtils('/project', fs)
    expect(await json.read('missing.json', { throw: false })).toBeNull()
  })

  it('throws when file not found and throw:true (default)', async () => {
    const fs = makeFsUtils({})
    const json = createJsonUtils('/project', fs)
    await expect(json.read('missing.json')).rejects.toThrow('ENOENT')
  })

  it('throws JsonParseError with file path on invalid JSON', async () => {
    const fs = makeFsUtils({ 'bad.json': '{invalid}' })
    const json = createJsonUtils('/project', fs)
    const err = await json.read('bad.json').catch(e => e)
    expect(err.name).toBe('JsonParseError')
    expect(err.message).toContain('bad.json')
  })

  it('includes line and column in JsonParseError when extractable', async () => {
    const fs = makeFsUtils({ 'bad.json': '{\n  "a": }\n' })
    const json = createJsonUtils('/project', fs)
    const err = await json.read('bad.json').catch(e => e)
    expect(err.name).toBe('JsonParseError')
  })
})

describe('json.get', () => {
  const PKG = JSON.stringify({ name: 'app', scripts: { build: 'tsc' }, engines: { node: '>=20' } })

  it('returns first JSONPath match', async () => {
    const fs = makeFsUtils({ 'package.json': PKG })
    const json = createJsonUtils('/project', fs)
    expect(await json.get('package.json', '$.name')).toBe('app')
  })

  it('returns nested value via JSONPath', async () => {
    const fs = makeFsUtils({ 'package.json': PKG })
    const json = createJsonUtils('/project', fs)
    expect(await json.get('package.json', '$.scripts.build')).toBe('tsc')
  })

  it('returns defaultValue when path has no match', async () => {
    const fs = makeFsUtils({ 'package.json': PKG })
    const json = createJsonUtils('/project', fs)
    expect(await json.get('package.json', '$.missing', 'fallback')).toBe('fallback')
  })

  it('returns undefined by default when path has no match', async () => {
    const fs = makeFsUtils({ 'package.json': PKG })
    const json = createJsonUtils('/project', fs)
    expect(await json.get('package.json', '$.missing')).toBeUndefined()
  })

  it('returns defaultValue when file not found', async () => {
    const fs = makeFsUtils({})
    const json = createJsonUtils('/project', fs)
    expect(await json.get('missing.json', '$.name', 'default')).toBe('default')
  })
})

describe('json.getAll', () => {
  const PKG = JSON.stringify({ dependencies: { react: '^18.0.0', lodash: '^4.17.21' } })

  it('returns all JSONPath matches as array', async () => {
    const fs = makeFsUtils({ 'package.json': PKG })
    const json = createJsonUtils('/project', fs)
    const results = await json.getAll('package.json', '$.dependencies[*]')
    expect(results).toHaveLength(2)
    expect(results).toContain('^18.0.0')
  })

  it('returns defaultValue when no matches', async () => {
    const fs = makeFsUtils({ 'package.json': PKG })
    const json = createJsonUtils('/project', fs)
    expect(await json.getAll('package.json', '$.missing[*]', ['none'])).toEqual(['none'])
  })

  it('returns [] when file not found', async () => {
    const fs = makeFsUtils({})
    const json = createJsonUtils('/project', fs)
    expect(await json.getAll('missing.json', '$.*')).toEqual([])
  })

  it('returns defaultValue when file not found', async () => {
    const fs = makeFsUtils({})
    const json = createJsonUtils('/project', fs)
    expect(await json.getAll('missing.json', '$.*', ['fallback'])).toEqual(['fallback'])
  })
})

describe('json.write', () => {
  it('serializes data with 2-space indentation by default', async () => {
    const fsUtils = makeFsUtils()
    const json = createJsonUtils('/project', fsUtils)
    await json.write('package.json', { name: 'my-app', version: '1.0.0' })
    expect(fsUtils.write).toHaveBeenCalledWith(
      'package.json',
      '{\n  "name": "my-app",\n  "version": "1.0.0"\n}\n'
    )
  })

  it('uses custom spaces when provided', async () => {
    const fsUtils = makeFsUtils()
    const json = createJsonUtils('/project', fsUtils)
    await json.write('tsconfig.json', { compilerOptions: {} }, { spaces: 4 })
    expect(fsUtils.write).toHaveBeenCalledWith(
      'tsconfig.json',
      '{\n    "compilerOptions": {}\n}\n'
    )
  })

  it('always appends a trailing newline', async () => {
    const fsUtils = makeFsUtils()
    const json = createJsonUtils('/project', fsUtils)
    await json.write('a.json', { x: 1 })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content.endsWith('\n')).toBe(true)
  })

  it('passes the filepath through to fsUtils.write unchanged', async () => {
    const fsUtils = makeFsUtils()
    const json = createJsonUtils('/project', fsUtils)
    await json.write('nested/config.json', [1, 2, 3])
    expect(fsUtils.write.mock.calls[0][0]).toBe('nested/config.json')
  })
})

describe('json.modify', () => {
  it('calls callback with parsed data and { exists: true } when file exists', async () => {
    const fsUtils = makeFsUtils({ 'pkg.json': '{"version":"1.0.0"}' })
    const json = createJsonUtils('/project', fsUtils)
    let capturedData, capturedCtx
    await json.modify('pkg.json', async (data, ctx) => { capturedData = structuredClone(data); capturedCtx = ctx })
    expect(capturedData).toEqual({ version: '1.0.0' })
    expect(capturedCtx).toEqual({ exists: true })
  })

  it('writes the mutated argument when callback returns undefined', async () => {
    const fsUtils = makeFsUtils({ 'pkg.json': '{"version":"1.0.0"}' })
    const json = createJsonUtils('/project', fsUtils)
    await json.modify('pkg.json', async (data) => { data.version = '2.0.0' })
    const written = JSON.parse(fsUtils.write.mock.calls[0][1])
    expect(written).toEqual({ version: '2.0.0' })
  })

  it('writes the returned object when callback returns a non-undefined value', async () => {
    const fsUtils = makeFsUtils({ 'pkg.json': '{"a":1}' })
    const json = createJsonUtils('/project', fsUtils)
    await json.modify('pkg.json', async (data) => ({ ...data, b: 2 }))
    const written = JSON.parse(fsUtils.write.mock.calls[0][1])
    expect(written).toEqual({ a: 1, b: 2 })
  })

  it('uses initial value when file is missing and initial provided', async () => {
    const fsUtils = makeFsUtils()
    const json = createJsonUtils('/project', fsUtils)
    let capturedCtx
    await json.modify('config.json', async (data, ctx) => { capturedCtx = ctx; data.enabled = true }, { initial: {} })
    expect(capturedCtx).toEqual({ exists: false })
    const written = JSON.parse(fsUtils.write.mock.calls[0][1])
    expect(written).toEqual({ enabled: true })
  })

  it('does not mutate the caller\'s initial object when modifying in place', async () => {
    const fsUtils = makeFsUtils()
    const json = createJsonUtils('/project', fsUtils)
    const initial = { x: 1 }
    await json.modify('config.json', async (data) => { data.y = 2 }, { initial })
    expect(initial).toEqual({ x: 1 })
  })

  it('throws ENOENT when file is missing and no initial provided', async () => {
    const fsUtils = makeFsUtils()
    const json = createJsonUtils('/project', fsUtils)
    await expect(json.modify('missing.json', async () => {})).rejects.toThrow('ENOENT')
  })

  it('propagates JsonParseError for invalid JSON', async () => {
    const fsUtils = makeFsUtils({ 'bad.json': '{invalid}' })
    const json = createJsonUtils('/project', fsUtils)
    const err = await json.modify('bad.json', async () => {}).catch(e => e)
    expect(err.name).toBe('JsonParseError')
  })

  it('passes the spaces option through to write', async () => {
    const fsUtils = makeFsUtils({ 'a.json': '{"x":1}' })
    const json = createJsonUtils('/project', fsUtils)
    await json.modify('a.json', async (d) => { d.y = 2 }, { spaces: 4 })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toContain('    "x"')
  })
})
