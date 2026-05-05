import { describe, it, expect, vi } from 'vitest'
import { createJsonUtils } from '../../../src/rune/api/json.js'

function makeFsUtils(files = {}) {
  return {
    read: vi.fn(async (relPath, opts = {}) => {
      if (relPath in files) return files[relPath]
      if (opts.throw === false) return null
      const err = new Error(`ENOENT: ${relPath}`)
      err.code = 'ENOENT'
      throw err
    }),
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
