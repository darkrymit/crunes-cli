import { describe, it, expect, vi } from 'vitest'
import { createYamlUtils, parseYaml, stringifyYaml } from '../../../src/rune/api/yaml.js'

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

  it('preserves comments on unchanged keys when modifying', async () => {
    const src = '# header\nreplicas: 3\n# image comment\nimage: app:latest\n'
    const fsUtils = makeFsUtils({ 'values.yaml': src })
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.modify('values.yaml', async (data) => { data.replicas = 5 })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toContain('# header')
    expect(content).toContain('replicas: 5')
    expect(content).toContain('# image comment')
    expect(content).toContain('image: app:latest')
  })
})

describe('yaml.read — enriched metadata', () => {
  it('parses #head from document-level comment', async () => {
    // blank line between comment and first key → doc.commentBefore (not pair.key.commentBefore)
    const fsUtils = makeFsUtils({ 'a.yaml': '# cluster config\n\nreplicas: 3\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    const data = await yaml.read('a.yaml')
    expect(data['#head']).toBe('cluster config')
  })

  it('parses #tail from trailing document comment', async () => {
    const fsUtils = makeFsUtils({ 'a.yaml': 'replicas: 3\n# end of file\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    const data = await yaml.read('a.yaml')
    expect(data['#tail']).toBe('end of file')
  })

  it('parses #comment:key from block comment before a mapping key', async () => {
    const fsUtils = makeFsUtils({ 'a.yaml': '# number of pods\nreplicas: 3\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    const data = await yaml.read('a.yaml')
    expect(data['#comment:replicas']).toBe('number of pods')
  })

  it('parses #inline:key from inline comment after a value', async () => {
    const fsUtils = makeFsUtils({ 'a.yaml': 'replicas: 3  # pod count\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    const data = await yaml.read('a.yaml')
    expect(data['#inline:replicas']).toBe('pod count')
  })

  it('parses #comment:key[N] from block comment before array item N', async () => {
    const fsUtils = makeFsUtils({ 'a.yaml': 'steps:\n  # checkout code\n  - uses: actions/checkout@v4\n  - run: npm test\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    const data = await yaml.read('a.yaml')
    expect(data['#comment:steps[0]']).toBe('checkout code')
    expect(data['#comment:steps[1]']).toBeUndefined()
  })

  it('parses #style:key as "literal" for | scalars', async () => {
    const fsUtils = makeFsUtils({ 'a.yaml': 'script: |\n  echo hello\n  echo world\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    const data = await yaml.read('a.yaml')
    expect(data['#style:script']).toBe('literal')
    expect(data.script).toBe('echo hello\necho world\n')
  })

  it('parses #style:key as "folded" for > scalars', async () => {
    const fsUtils = makeFsUtils({ 'a.yaml': 'desc: >\n  long text\n  continues here\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    const data = await yaml.read('a.yaml')
    expect(data['#style:desc']).toBe('folded')
  })

  it('trims whitespace from comment text', async () => {
    const fsUtils = makeFsUtils({ 'a.yaml': '#   spaced comment   \nreplicas: 3\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    const data = await yaml.read('a.yaml')
    expect(data['#comment:replicas']).toBe('spaced comment')
  })

  it('stores multi-line block comment as \\n-joined string', async () => {
    const fsUtils = makeFsUtils({ 'a.yaml': '# line one\n# line two\nreplicas: 3\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    const data = await yaml.read('a.yaml')
    expect(data['#comment:replicas']).toBe('line one\nline two')
  })

  it('plain YAML without comments returns object with no # keys', async () => {
    const fsUtils = makeFsUtils({ 'a.yaml': 'replicas: 3\nimage: app:latest\n' })
    const yaml = createYamlUtils('/project', fsUtils)
    const data = await yaml.read('a.yaml')
    expect(Object.keys(data).filter(k => k.startsWith('#'))).toHaveLength(0)
  })
})

describe('yaml.write — enriched metadata', () => {
  it('serializes #head as document head comment', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.write('a.yaml', { '#head': 'Helm values', replicas: 3 })
    expect(fsUtils.write.mock.calls[0][1]).toMatch(/^# Helm values\n/)
  })

  it('serializes #tail as document tail comment', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.write('a.yaml', { replicas: 3, '#tail': 'end of file' })
    expect(fsUtils.write.mock.calls[0][1]).toMatch(/# end of file\n$/)
  })

  it('serializes #comment:key as block comment before the key', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.write('a.yaml', { '#comment:replicas': 'number of pods', replicas: 3 })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toMatch(/# number of pods\nreplicas: 3/)
  })

  it('serializes #inline:key as inline comment after the value', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.write('a.yaml', { replicas: 3, '#inline:replicas': 'pod count' })
    // yaml package produces a single space before #
    expect(fsUtils.write.mock.calls[0][1]).toContain('replicas: 3 # pod count')
  })

  it('serializes #comment:key[N] as block comment before array item N', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.write('a.yaml', {
      '#comment:steps[0]': 'checkout code',
      steps: [{ uses: 'actions/checkout@v4' }, { run: 'npm test' }],
    })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toMatch(/# checkout code\n\s+- uses: actions\/checkout@v4/)
  })

  it('serializes #style:key "literal" as | block scalar', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.write('a.yaml', { script: 'echo hello\necho world\n', '#style:script': 'literal' })
    expect(fsUtils.write.mock.calls[0][1]).toContain('script: |')
  })

  it('serializes #style:key "folded" as > block scalar', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.write('a.yaml', { desc: 'long text here', '#style:desc': 'folded' })
    expect(fsUtils.write.mock.calls[0][1]).toContain('desc: >')
  })

  it('serializes multi-line #comment:key with \\n as multiple # lines', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.write('a.yaml', { '#comment:replicas': 'number of pods\nmust be >= 1', replicas: 3 })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toContain('# number of pods')
    expect(content).toContain('# must be >= 1')
  })

  it('silently ignores unknown #-prefixed keys', async () => {
    const fsUtils = makeFsUtils()
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.write('a.yaml', { '#unknown:foo': 'bar', replicas: 3 })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).not.toContain('#unknown')
    expect(content).toContain('replicas: 3')
  })
})

describe('yaml.modify — enriched metadata', () => {
  it('comment keys are visible to callback', async () => {
    const src = '# header\nreplicas: 3\n'
    const fsUtils = makeFsUtils({ 'a.yaml': src })
    const yaml = createYamlUtils('/project', fsUtils)
    let capturedKeys
    await yaml.modify('a.yaml', async (data) => {
      capturedKeys = Object.keys(data).filter(k => k.startsWith('#'))
    })
    expect(capturedKeys).toContain('#comment:replicas')
  })

  it('comment keys are preserved when callback does not touch them', async () => {
    const src = '# header comment\nreplicas: 3\n'
    const fsUtils = makeFsUtils({ 'a.yaml': src })
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.modify('a.yaml', async (data) => { data.replicas = 5 })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toContain('# header comment')
    expect(content).toContain('replicas: 5')
  })

  it('callback can add #comment:key to a new key', async () => {
    const src = 'replicas: 3\n'
    const fsUtils = makeFsUtils({ 'a.yaml': src })
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.modify('a.yaml', async (data) => {
      data['#comment:newFeature'] = 'opt-in flag'
      data.newFeature = true
    })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toMatch(/# opt-in flag\nnewFeature: true/)
  })

  it('callback can add #comment:key[N] when pushing to an array', async () => {
    const src = 'steps:\n  - run: npm test\n'
    const fsUtils = makeFsUtils({ 'a.yaml': src })
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.modify('a.yaml', async (data) => {
      const i = data.steps.length
      data.steps.push({ run: 'npm run lint' })
      data[`#comment:steps[${i}]`] = 'lint check'
    })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toMatch(/# lint check\n\s+- run: npm run lint/)
  })

  it('callback can delete a comment key', async () => {
    const src = '# should be removed\nreplicas: 3\n'
    const fsUtils = makeFsUtils({ 'a.yaml': src })
    const yaml = createYamlUtils('/project', fsUtils)
    await yaml.modify('a.yaml', async (data) => {
      delete data['#comment:replicas']
    })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).not.toContain('# should be removed')
    expect(content).toContain('replicas: 3')
  })
})

describe('parseYaml', () => {
  it('parses plain YAML string', () => {
    expect(parseYaml('name: test\nversion: 1')).toEqual({ name: 'test', version: 1 })
  })

  it('encodes top document comment as #head when separated by blank line', () => {
    const result = parseYaml('# file header\n\nname: test')
    expect(result['#head']).toBe('file header')
    expect(result.name).toBe('test')
  })

  it('encodes before-key comment as #comment:key', () => {
    const result = parseYaml('# the name\nname: test')
    expect(result['#comment:name']).toBe('the name')
  })

  it('encodes inline comment as #inline:key', () => {
    const result = parseYaml('version: 1 # semver')
    expect(result['#inline:version']).toBe('semver')
  })

  it('encodes literal block scalar style as #style:key', () => {
    const result = parseYaml('content: |\n  line1\n  line2')
    expect(result['#style:content']).toBe('literal')
  })

  it('defaults displayPath to <string> in error message', () => {
    expect(() => parseYaml(': bad: yaml: {')).toThrow('Failed to parse <string>')
  })
})

describe('stringifyYaml', () => {
  it('round-trips plain object through parse', () => {
    const out = stringifyYaml({ name: 'test', version: 1 })
    expect(parseYaml(out)).toEqual({ name: 'test', version: 1 })
  })

  it('writes #head as document-level comment', () => {
    const out = stringifyYaml({ '#head': 'generated', name: 'test' })
    expect(out).toContain('# generated')
  })

  it('writes #comment:key as before-key comment', () => {
    const out = stringifyYaml({ '#comment:name': 'the name', name: 'test' })
    expect(out).toContain('# the name')
  })

  it('writes #inline:key as inline comment', () => {
    const out = stringifyYaml({ version: 1, '#inline:version': 'semver' })
    expect(out).toContain('# semver')
  })

  it('does not write #-prefixed keys as YAML properties', () => {
    const out = stringifyYaml({ '#head': 'top', name: 'test' })
    expect(out).not.toContain('#head:')
  })

  it('always ends with newline', () => {
    expect(stringifyYaml({ a: 1 }).endsWith('\n')).toBe(true)
  })
})

describe('yaml.readPath', () => {
  it('returns first JSONPath match', async () => {
    const fs = makeFsUtils({ 'ci.yml': 'jobs:\n  ci:\n    runs-on: ubuntu-latest' })
    const yaml = createYamlUtils('/project', fs)
    expect(await yaml.readPath('ci.yml', '$.jobs.ci.runs-on')).toBe('ubuntu-latest')
  })

  it('returns fallback when no match', async () => {
    const fs = makeFsUtils({ 'ci.yml': 'name: CI' })
    const yaml = createYamlUtils('/project', fs)
    expect(await yaml.readPath('ci.yml', '$.missing', 'default')).toBe('default')
  })

  it('returns undefined when no match and no fallback', async () => {
    const fs = makeFsUtils({ 'ci.yml': 'name: CI' })
    const yaml = createYamlUtils('/project', fs)
    expect(await yaml.readPath('ci.yml', '$.missing')).toBeUndefined()
  })

  it('returns fallback when file missing', async () => {
    const fs = makeFsUtils()
    const yaml = createYamlUtils('/project', fs)
    expect(await yaml.readPath('missing.yml', '$.name', 'fallback')).toBe('fallback')
  })
})

describe('yaml.readPathAll', () => {
  it('returns all matches', async () => {
    const fs = makeFsUtils({ 'cfg.yml': 'items:\n  - a\n  - b\n  - c' })
    const yaml = createYamlUtils('/project', fs)
    expect(await yaml.readPathAll('cfg.yml', '$.items[*]')).toEqual(['a', 'b', 'c'])
  })

  it('returns fallback when no matches', async () => {
    const fs = makeFsUtils({ 'cfg.yml': 'name: test' })
    const yaml = createYamlUtils('/project', fs)
    expect(await yaml.readPathAll('cfg.yml', '$.missing[*]', ['none'])).toEqual(['none'])
  })

  it('returns [] when file missing and no fallback', async () => {
    const fs = makeFsUtils()
    const yaml = createYamlUtils('/project', fs)
    expect(await yaml.readPathAll('missing.yml', '$.*')).toEqual([])
  })
})

describe('yaml.writePath', () => {
  it('sets an existing key', async () => {
    const fs = makeFsUtils({ 'cfg.yml': 'version: 1' })
    const yaml = createYamlUtils('/project', fs)
    await yaml.writePath('cfg.yml', '$.version', 2)
    expect(parseYaml(fs.write.mock.calls[0][1])).toEqual({ version: 2 })
  })

  it('creates intermediate nodes', async () => {
    const fs = makeFsUtils({ 'cfg.yml': '{}' })
    const yaml = createYamlUtils('/project', fs)
    await yaml.writePath('cfg.yml', '$.server.port', 3000)
    expect(parseYaml(fs.write.mock.calls[0][1])).toEqual({ server: { port: 3000 } })
  })

  it('creates file when missing', async () => {
    const fs = makeFsUtils()
    const yaml = createYamlUtils('/project', fs)
    await yaml.writePath('cfg.yml', '$.name', 'test')
    expect(parseYaml(fs.write.mock.calls[0][1])).toEqual({ name: 'test' })
  })

  it('deletes a key when value is undefined', async () => {
    const fs = makeFsUtils({ 'cfg.yml': 'name: test\nversion: 1' })
    const yaml = createYamlUtils('/project', fs)
    await yaml.writePath('cfg.yml', '$.version', undefined)
    const result = parseYaml(fs.write.mock.calls[0][1])
    expect(result.version).toBeUndefined()
    expect(result.name).toBe('test')
  })

  it('no-op when deleting from missing file', async () => {
    const fs = makeFsUtils()
    const yaml = createYamlUtils('/project', fs)
    await yaml.writePath('missing.yml', '$.version', undefined)
    expect(fs.write).not.toHaveBeenCalled()
  })

  it('preserves comments through writePath', async () => {
    const fs = makeFsUtils({ 'cfg.yml': '# top\nversion: 1\n' })
    const yaml = createYamlUtils('/project', fs)
    await yaml.writePath('cfg.yml', '$.version', 2)
    const written = fs.write.mock.calls[0][1]
    expect(written).toContain('# top')
    expect(written).toContain('2')
  })
})
