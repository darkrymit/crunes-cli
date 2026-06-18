import { describe, it, expect, vi } from 'vitest'
import { createJsonUtils, detectFormat, parseJsonc, stringifyJsonc, parseJson5, stringifyJson5 } from '../../../src/rune/api/json.js'

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

describe('json.readPath', () => {
  const PKG = JSON.stringify({ name: 'app', scripts: { build: 'tsc' }, engines: { node: '>=20' } })

  it('returns first JSONPath match', async () => {
    const fs = makeFsUtils({ 'package.json': PKG })
    const json = createJsonUtils('/project', fs)
    expect(await json.readPath('package.json', '$.name')).toBe('app')
  })

  it('returns nested value via JSONPath', async () => {
    const fs = makeFsUtils({ 'package.json': PKG })
    const json = createJsonUtils('/project', fs)
    expect(await json.readPath('package.json', '$.scripts.build')).toBe('tsc')
  })

  it('returns defaultValue when path has no match', async () => {
    const fs = makeFsUtils({ 'package.json': PKG })
    const json = createJsonUtils('/project', fs)
    expect(await json.readPath('package.json', '$.missing', 'fallback')).toBe('fallback')
  })

  it('returns undefined by default when path has no match', async () => {
    const fs = makeFsUtils({ 'package.json': PKG })
    const json = createJsonUtils('/project', fs)
    expect(await json.readPath('package.json', '$.missing')).toBeUndefined()
  })

  it('returns defaultValue when file not found', async () => {
    const fs = makeFsUtils({})
    const json = createJsonUtils('/project', fs)
    expect(await json.readPath('missing.json', '$.name', 'default')).toBe('default')
  })
})

describe('json.readPathAll', () => {
  const PKG = JSON.stringify({ dependencies: { react: '^18.0.0', lodash: '^4.17.21' } })

  it('returns all JSONPath matches as array', async () => {
    const fs = makeFsUtils({ 'package.json': PKG })
    const json = createJsonUtils('/project', fs)
    const results = await json.readPathAll('package.json', '$.dependencies[*]')
    expect(results).toHaveLength(2)
    expect(results).toContain('^18.0.0')
  })

  it('returns defaultValue when no matches', async () => {
    const fs = makeFsUtils({ 'package.json': PKG })
    const json = createJsonUtils('/project', fs)
    expect(await json.readPathAll('package.json', '$.missing[*]', ['none'])).toEqual(['none'])
  })

  it('returns [] when file not found', async () => {
    const fs = makeFsUtils({})
    const json = createJsonUtils('/project', fs)
    expect(await json.readPathAll('missing.json', '$.*')).toEqual([])
  })

  it('returns defaultValue when file not found', async () => {
    const fs = makeFsUtils({})
    const json = createJsonUtils('/project', fs)
    expect(await json.readPathAll('missing.json', '$.*', ['fallback'])).toEqual(['fallback'])
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

describe('detectFormat', () => {
  it('returns json for .json extension', () => {
    expect(detectFormat('config.json')).toBe('json')
  })

  it('returns jsonc for .jsonc extension', () => {
    expect(detectFormat('tsconfig.jsonc')).toBe('jsonc')
  })

  it('returns json5 for .json5 extension', () => {
    expect(detectFormat('config.json5')).toBe('json5')
  })

  it('returns json for unknown extension', () => {
    expect(detectFormat('Makefile')).toBe('json')
  })

  it('opts.format overrides extension', () => {
    expect(detectFormat('config.json', 'jsonc')).toBe('jsonc')
    expect(detectFormat('config.jsonc', 'json')).toBe('json')
    expect(detectFormat('config.json', 'json5')).toBe('json5')
  })
})

describe('parseJsonc', () => {
  it('parses plain JSONC without comments', () => {
    expect(parseJsonc('{"a":1}', 'test.jsonc')).toEqual({ a: 1 })
  })

  it('encodes top-level comment as #head', () => {
    const result = parseJsonc('// file header\n{"a":1}', 'test.jsonc')
    expect(result['#head']).toBe('file header')
    expect(result.a).toBe(1)
  })

  it('encodes before-key comment as #comment:key', () => {
    const result = parseJsonc('{\n  // the name\n  "name": "test"\n}', 'test.jsonc')
    expect(result['#comment:name']).toBe('the name')
    expect(result.name).toBe('test')
  })

  it('encodes inline comment as #inline:key', () => {
    const result = parseJsonc('{"version":"1.0" // semver\n}', 'test.jsonc')
    expect(result['#inline:version']).toBe('semver')
  })

  it('throws JsonParseError on invalid JSONC', () => {
    expect(() => parseJsonc('{bad}', 'test.jsonc')).toThrow('Failed to parse')
  })
})

describe('stringifyJsonc', () => {
  it('round-trips plain object', () => {
    const out = stringifyJsonc({ a: 1 }, 2)
    expect(JSON.parse(out)).toEqual({ a: 1 })
  })

  it('writes #head as top-level comment', () => {
    const out = stringifyJsonc({ '#head': 'generated', a: 1 }, 2)
    expect(out).toContain('// generated')
    expect(JSON.parse(out.replace(/\/\/[^\n]*/g, '').trim())).toEqual({ a: 1 })
  })

  it('writes #comment:key as before-key comment', () => {
    const out = stringifyJsonc({ '#comment:name': 'the name', name: 'test' }, 2)
    expect(out).toContain('// the name')
    expect(out).toContain('"name"')
  })

  it('writes #inline:key as inline comment', () => {
    const out = stringifyJsonc({ version: '1.0', '#inline:version': 'semver' }, 2)
    expect(out).toContain('// semver')
  })

  it('round-trips comments through parse → stringify', () => {
    const src = '// top\n{\n  // the name\n  "name": "test" // inline\n}'
    const parsed = parseJsonc(src, 'test.jsonc')
    const out = stringifyJsonc(parsed, 2)
    expect(out).toContain('// top')
    expect(out).toContain('// the name')
    expect(out).toContain('// inline')
  })

  it('#-prefixed keys are not written as JSON properties', () => {
    const out = stringifyJsonc({ '#head': 'top', name: 'test' }, 2)
    expect(out).not.toContain('"#head"')
  })
})

describe('parseJson5', () => {
  it('parses standard JSON', () => {
    expect(parseJson5('{"a":1}', 'test.json5')).toEqual({ a: 1 })
  })

  it('parses unquoted keys', () => {
    expect(parseJson5('{a: 1}', 'test.json5')).toEqual({ a: 1 })
  })

  it('parses single-quoted strings', () => {
    expect(parseJson5("{name: 'test'}", 'test.json5')).toEqual({ name: 'test' })
  })

  it('parses trailing commas', () => {
    expect(parseJson5('{a: 1,}', 'test.json5')).toEqual({ a: 1 })
  })

  it('parses comments (strips them)', () => {
    expect(parseJson5('// comment\n{a: 1}', 'test.json5')).toEqual({ a: 1 })
  })

  it('throws JsonParseError on invalid JSON5', () => {
    expect(() => parseJson5('{bad json5!!!}', 'test.json5')).toThrow('Failed to parse')
  })
})

describe('stringifyJson5', () => {
  it('serializes to JSON5 format', () => {
    const out = stringifyJson5({ a: 1, b: 'hello' }, 2)
    expect(parseJson5(out, 'test.json5')).toEqual({ a: 1, b: 'hello' })
  })

  it('always appends trailing newline', () => {
    expect(stringifyJson5({ a: 1 }, 2).endsWith('\n')).toBe(true)
  })
})

describe('json.read — multi-format', () => {
  it('reads .jsonc file preserving comment keys', async () => {
    const fs = makeFsUtils({ 'cfg.jsonc': '// top\n{"a":1}' })
    const json = createJsonUtils('/project', fs)
    const result = await json.read('cfg.jsonc')
    expect(result['#head']).toBe('top')
    expect(result.a).toBe(1)
  })

  it('reads .json5 file with unquoted keys', async () => {
    const fs = makeFsUtils({ 'cfg.json5': '{a: 1}' })
    const json = createJsonUtils('/project', fs)
    expect(await json.read('cfg.json5')).toEqual({ a: 1 })
  })

  it('opts.format overrides extension', async () => {
    const fs = makeFsUtils({ 'tsconfig.json': '// comment\n{"strict":true}' })
    const json = createJsonUtils('/project', fs)
    const result = await json.read('tsconfig.json', { format: 'jsonc' })
    expect(result['#head']).toBe('comment')
    expect(result.strict).toBe(true)
  })
})

describe('json.write — multi-format', () => {
  it('writes .jsonc file with comment keys as JSONC comments', async () => {
    const fsUtils = makeFsUtils()
    const json = createJsonUtils('/project', fsUtils)
    await json.write('cfg.jsonc', { '#head': 'generated', name: 'test' })
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toContain('// generated')
    expect(written).toContain('"name"')
  })

  it('writes .json5 file as JSON5', async () => {
    const fsUtils = makeFsUtils()
    const json = createJsonUtils('/project', fsUtils)
    await json.write('cfg.json5', { a: 1 })
    const written = fsUtils.write.mock.calls[0][1]
    expect(parseJson5(written, 'cfg.json5')).toEqual({ a: 1 })
  })

  it('opts.format: jsonc writes JSONC to .json file', async () => {
    const fsUtils = makeFsUtils()
    const json = createJsonUtils('/project', fsUtils)
    await json.write('tsconfig.json', { '#head': 'ts config', strict: true }, { format: 'jsonc' })
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toContain('// ts config')
  })
})

describe('json.modify — multi-format', () => {
  it('preserves JSONC comments through modify cycle', async () => {
    const fsUtils = makeFsUtils({ 'cfg.jsonc': '// top\n{"version":"1.0"}' })
    const json = createJsonUtils('/project', fsUtils)
    await json.modify('cfg.jsonc', (data) => { data.version = '2.0' })
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toContain('// top')
    expect(written).toContain('"2.0"')
  })
})

describe('json.writePath', () => {
  it('sets an existing top-level key', async () => {
    const fsUtils = makeFsUtils({ 'pkg.json': '{"name":"old"}' })
    const json = createJsonUtils('/project', fsUtils)
    await json.writePath('pkg.json', '$.name', 'new')
    expect(JSON.parse(fsUtils.write.mock.calls[0][1])).toEqual({ name: 'new' })
  })

  it('sets a nested key', async () => {
    const fsUtils = makeFsUtils({ 'pkg.json': '{"scripts":{"build":"tsc"}}' })
    const json = createJsonUtils('/project', fsUtils)
    await json.writePath('pkg.json', '$.scripts.test', 'vitest')
    expect(JSON.parse(fsUtils.write.mock.calls[0][1])).toEqual({ scripts: { build: 'tsc', test: 'vitest' } })
  })

  it('creates intermediate nodes when missing', async () => {
    const fsUtils = makeFsUtils({ 'pkg.json': '{}' })
    const json = createJsonUtils('/project', fsUtils)
    await json.writePath('pkg.json', '$.scripts.build', 'tsc')
    expect(JSON.parse(fsUtils.write.mock.calls[0][1])).toEqual({ scripts: { build: 'tsc' } })
  })

  it('creates file when missing', async () => {
    const fsUtils = makeFsUtils()
    const json = createJsonUtils('/project', fsUtils)
    await json.writePath('pkg.json', '$.version', '1.0.0')
    expect(JSON.parse(fsUtils.write.mock.calls[0][1])).toEqual({ version: '1.0.0' })
  })

  it('deletes a key when value is undefined', async () => {
    const fsUtils = makeFsUtils({ 'pkg.json': '{"name":"test","version":"1.0"}' })
    const json = createJsonUtils('/project', fsUtils)
    await json.writePath('pkg.json', '$.version', undefined)
    expect(JSON.parse(fsUtils.write.mock.calls[0][1])).toEqual({ name: 'test' })
  })

  it('no-op when deleting from missing file', async () => {
    const fsUtils = makeFsUtils()
    const json = createJsonUtils('/project', fsUtils)
    await json.writePath('missing.json', '$.version', undefined)
    expect(fsUtils.write).not.toHaveBeenCalled()
  })

  it('preserves JSONC comments through writePath', async () => {
    const fsUtils = makeFsUtils({ 'cfg.jsonc': '// top\n{"version":"1.0"}' })
    const json = createJsonUtils('/project', fsUtils)
    await json.writePath('cfg.jsonc', '$.version', '2.0')
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toContain('// top')
    expect(written).toContain('"2.0"')
  })

  it('passes format opt through to read/write', async () => {
    const fsUtils = makeFsUtils({ 'tsconfig.json': '// comment\n{"strict":true}' })
    const json = createJsonUtils('/project', fsUtils)
    await json.writePath('tsconfig.json', '$.strict', false, { format: 'jsonc' })
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toContain('// comment')
    expect(written).toContain('false')
  })
})
