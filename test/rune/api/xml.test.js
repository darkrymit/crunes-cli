import { describe, it, expect, vi } from 'vitest'
import { createXmlUtils, parseXml, stringifyXml } from '../../../src/rune/api/xml.js'

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

const SIMPLE_XML = '<?xml version="1.0" encoding="UTF-8"?><project><version>1.0.0</version></project>'
const ATTR_XML   = '<project id="main"><name>crunes</name></project>'
const COMMENT_XML = '<root><!-- first --><!-- second --><value>hello</value></root>'
const CDATA_XML   = '<root><desc><![CDATA[line1\nline2]]></desc></root>'
const INVALID_XML = '<root attr=notquoted />'

describe('xml.read', () => {
  it('parses valid XML and preserves ?xml declaration key', async () => {
    const fsUtils = makeFsUtils({ 'pom.xml': SIMPLE_XML })
    const xml = createXmlUtils('/project', fsUtils)
    const result = await xml.read('pom.xml')
    expect(result['?xml']).toEqual({ '@_version': '1.0', '@_encoding': 'UTF-8' })
    expect(result.project.version).toBe('1.0.0')
  })

  it('parses attributes under @_ prefix', async () => {
    const fsUtils = makeFsUtils({ 'cfg.xml': ATTR_XML })
    const xml = createXmlUtils('/project', fsUtils)
    const result = await xml.read('cfg.xml')
    expect(result.project['@_id']).toBe('main')
    expect(result.project.name).toBe('crunes')
  })

  it('parses multiple sibling comments as #comment array', async () => {
    const fsUtils = makeFsUtils({ 'cfg.xml': COMMENT_XML })
    const xml = createXmlUtils('/project', fsUtils)
    const result = await xml.read('cfg.xml')
    expect(result.root['#comment']).toEqual([' first ', ' second '])
  })

  it('parses CDATA section as #cdata string', async () => {
    const fsUtils = makeFsUtils({ 'cfg.xml': CDATA_XML })
    const xml = createXmlUtils('/project', fsUtils)
    const result = await xml.read('cfg.xml')
    expect(result.root.desc['#cdata']).toBe('line1\nline2')
  })

  it('returns null when file not found and throw:false', async () => {
    const fsUtils = makeFsUtils({})
    const xml = createXmlUtils('/project', fsUtils)
    expect(await xml.read('missing.xml', { throw: false })).toBeNull()
  })

  it('throws ENOENT when file not found and throw:true (default)', async () => {
    const fsUtils = makeFsUtils({})
    const xml = createXmlUtils('/project', fsUtils)
    await expect(xml.read('missing.xml')).rejects.toThrow('ENOENT')
  })

  it('throws XmlParseError with file path on invalid XML', async () => {
    const fsUtils = makeFsUtils({ 'bad.xml': INVALID_XML })
    const xml = createXmlUtils('/project', fsUtils)
    const err = await xml.read('bad.xml').catch(e => e)
    expect(err.name).toBe('XmlParseError')
    expect(err.message).toContain('bad.xml')
  })

  it('includes line and column in XmlParseError when available', async () => {
    const fsUtils = makeFsUtils({ 'bad.xml': INVALID_XML })
    const xml = createXmlUtils('/project', fsUtils)
    const err = await xml.read('bad.xml').catch(e => e)
    expect(err.name).toBe('XmlParseError')
    expect(err.message).toMatch(/line \d+, column \d+/)
  })
})

describe('xml.write', () => {
  it('serializes data to XML with 2-space indent by default', async () => {
    const fsUtils = makeFsUtils()
    const xml = createXmlUtils('/project', fsUtils)
    await xml.write('out.xml', { root: { value: 'hello' } })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toContain('<root>')
    expect(content).toContain('<value>hello</value>')
    expect(content).toContain('  <value>')
  })

  it('uses custom indent when provided', async () => {
    const fsUtils = makeFsUtils()
    const xml = createXmlUtils('/project', fsUtils)
    await xml.write('out.xml', { root: { child: { value: 1 } } }, { indent: 4 })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toContain('    <child>')
  })

  it('always ends with a trailing newline', async () => {
    const fsUtils = makeFsUtils()
    const xml = createXmlUtils('/project', fsUtils)
    await xml.write('out.xml', { root: {} })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content.endsWith('\n')).toBe(true)
  })

  it('passes the filepath through to fsUtils.write unchanged', async () => {
    const fsUtils = makeFsUtils()
    const xml = createXmlUtils('/project', fsUtils)
    await xml.write('nested/config.xml', { root: {} })
    expect(fsUtils.write.mock.calls[0][0]).toBe('nested/config.xml')
  })

  it('round-trips ?xml declaration key', async () => {
    const fsUtils = makeFsUtils()
    const xml = createXmlUtils('/project', fsUtils)
    await xml.write('out.xml', { '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' }, root: {} })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toContain('<?xml')
    expect(content).toContain('version="1.0"')
    expect(content).toContain('encoding="UTF-8"')
  })

  it('round-trips #comment array as XML comments', async () => {
    const fsUtils = makeFsUtils()
    const xml = createXmlUtils('/project', fsUtils)
    await xml.write('out.xml', { root: { '#comment': ['first', 'second'], value: 'x' } })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toContain('<!--')
    expect(content).toContain('first')
    expect(content).toContain('second')
  })

  it('round-trips #cdata as CDATA section', async () => {
    const fsUtils = makeFsUtils()
    const xml = createXmlUtils('/project', fsUtils)
    await xml.write('out.xml', { root: { desc: { '#cdata': 'line1\nline2' } } })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toContain('<![CDATA[')
    expect(content).toContain('line1')
  })
})

describe('xml.modify', () => {
  it('calls callback with parsed data and { exists: true } when file exists', async () => {
    const fsUtils = makeFsUtils({ 'cfg.xml': SIMPLE_XML })
    const xml = createXmlUtils('/project', fsUtils)
    let capturedData, capturedCtx
    await xml.modify('cfg.xml', async (data, ctx) => {
      capturedData = structuredClone(data)
      capturedCtx = ctx
    })
    expect(capturedData.project.version).toBe('1.0.0')
    expect(capturedCtx).toEqual({ exists: true })
  })

  it('writes the mutated argument when callback returns undefined', async () => {
    const fsUtils = makeFsUtils({ 'cfg.xml': SIMPLE_XML })
    const xml = createXmlUtils('/project', fsUtils)
    await xml.modify('cfg.xml', async (data) => { data.project.version = '2.0.0' })
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toContain('2.0.0')
  })

  it('writes the returned object when callback returns a non-undefined value', async () => {
    const fsUtils = makeFsUtils({ 'cfg.xml': SIMPLE_XML })
    const xml = createXmlUtils('/project', fsUtils)
    await xml.modify('cfg.xml', async (data) => ({
      ...data,
      project: { ...data.project, name: 'new' },
    }))
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toContain('new')
    expect(written).toContain('1.0.0')
  })

  it('uses initial value when file is missing and initial provided', async () => {
    const fsUtils = makeFsUtils()
    const xml = createXmlUtils('/project', fsUtils)
    let capturedCtx
    await xml.modify('cfg.xml', async (data, ctx) => {
      capturedCtx = ctx
      data.root = { enabled: true }
    }, { initial: {} })
    expect(capturedCtx).toEqual({ exists: false })
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toContain('enabled')
  })

  it('does not mutate the caller\'s initial object', async () => {
    const fsUtils = makeFsUtils()
    const xml = createXmlUtils('/project', fsUtils)
    const initial = { root: {} }
    await xml.modify('cfg.xml', async (data) => { data.root.x = 1 }, { initial })
    expect(initial.root.x).toBeUndefined()
  })

  it('throws ENOENT when file is missing and no initial provided', async () => {
    const fsUtils = makeFsUtils()
    const xml = createXmlUtils('/project', fsUtils)
    await expect(xml.modify('missing.xml', async () => {})).rejects.toThrow('ENOENT')
  })

  it('propagates XmlParseError for invalid XML', async () => {
    const fsUtils = makeFsUtils({ 'bad.xml': INVALID_XML })
    const xml = createXmlUtils('/project', fsUtils)
    const err = await xml.modify('bad.xml', async () => {}).catch(e => e)
    expect(err.name).toBe('XmlParseError')
  })

  it('passes the indent option through to write', async () => {
    const fsUtils = makeFsUtils({ 'cfg.xml': '<root><child><value>1</value></child></root>' })
    const xml = createXmlUtils('/project', fsUtils)
    await xml.modify('cfg.xml', async (d) => { d.root.child.extra = 2 }, { indent: 4 })
    const content = fsUtils.write.mock.calls[0][1]
    expect(content).toContain('    <child>')
  })
})

describe('parseXml', () => {
  it('parses simple XML to JS object', () => {
    const result = parseXml('<root><name>test</name><tag>stable</tag></root>')
    expect(result.root.name).toBe('test')
    expect(result.root.tag).toBe('stable')
  })

  it('exposes attributes with @_ prefix', () => {
    const result = parseXml('<root id="42"><name>test</name></root>')
    expect(result.root['@_id']).toBe('42')
  })

  it('collects comments as #comment array', () => {
    const result = parseXml('<root><!-- note --><name>test</name></root>')
    expect(Array.isArray(result.root['#comment'])).toBe(true)
    expect(result.root['#comment'].some(c => c.includes('note'))).toBe(true)
  })

  it('defaults displayPath to <string> in error message', () => {
    expect(() => parseXml('<unclosed>')).toThrow('Failed to parse <string>')
  })
})

describe('stringifyXml', () => {
  it('round-trips simple XML', () => {
    const parsed = parseXml('<root><name>test</name><tag>stable</tag></root>')
    const out = stringifyXml(parsed)
    const back = parseXml(out)
    expect(back.root.name).toBe('test')
    expect(back.root.tag).toBe('stable')
  })

  it('round-trips attributes', () => {
    const parsed = parseXml('<root id="42"><name>test</name></root>')
    const out = stringifyXml(parsed)
    expect(parseXml(out).root['@_id']).toBe('42')
  })

  it('always ends with newline', () => {
    const parsed = parseXml('<root><name>test</name></root>')
    expect(stringifyXml(parsed).endsWith('\n')).toBe(true)
  })
})

describe('xml.readPath', () => {
  it('returns first JSONPath match', async () => {
    const fsUtils = makeFsUtils({ 'pom.xml': SIMPLE_XML })
    const xml = createXmlUtils('/project', fsUtils)
    expect(await xml.readPath('pom.xml', '$.project.version')).toBe('1.0.0')
  })

  it('returns fallback when no match', async () => {
    const fsUtils = makeFsUtils({ 'pom.xml': SIMPLE_XML })
    const xml = createXmlUtils('/project', fsUtils)
    expect(await xml.readPath('pom.xml', '$.project.missing', 'default')).toBe('default')
  })

  it('returns undefined when no match and no fallback', async () => {
    const fsUtils = makeFsUtils({ 'pom.xml': SIMPLE_XML })
    const xml = createXmlUtils('/project', fsUtils)
    expect(await xml.readPath('pom.xml', '$.project.missing')).toBeUndefined()
  })

  it('returns fallback when file missing', async () => {
    const fsUtils = makeFsUtils()
    const xml = createXmlUtils('/project', fsUtils)
    expect(await xml.readPath('missing.xml', '$.project.version', 'fallback')).toBe('fallback')
  })
})

describe('xml.readPathAll', () => {
  it('returns all matches', async () => {
    const fsUtils = makeFsUtils({ 'data.xml': '<root><item>a</item><item>b</item></root>' })
    const xml = createXmlUtils('/project', fsUtils)
    const results = await xml.readPathAll('data.xml', '$.root.item[*]')
    expect(Array.isArray(results)).toBe(true)
    expect(results).toContain('a')
    expect(results).toContain('b')
  })

  it('returns fallback when no matches', async () => {
    const fsUtils = makeFsUtils({ 'pom.xml': SIMPLE_XML })
    const xml = createXmlUtils('/project', fsUtils)
    expect(await xml.readPathAll('pom.xml', '$.project.missing', ['none'])).toEqual(['none'])
  })

  it('returns [] when file missing and no fallback', async () => {
    const fsUtils = makeFsUtils()
    const xml = createXmlUtils('/project', fsUtils)
    expect(await xml.readPathAll('missing.xml', '$.*')).toEqual([])
  })
})

describe('xml.writePath', () => {
  it('sets an existing node', async () => {
    const fsUtils = makeFsUtils({ 'pom.xml': SIMPLE_XML })
    const xml = createXmlUtils('/project', fsUtils)
    await xml.writePath('pom.xml', '$.project.version', '2.0.0')
    expect(parseXml(fsUtils.write.mock.calls[0][1]).project.version).toBe('2.0.0')
  })

  it('creates intermediate nodes', async () => {
    const fsUtils = makeFsUtils({ 'pom.xml': '<root></root>' })
    const xml = createXmlUtils('/project', fsUtils)
    await xml.writePath('pom.xml', '$.root.meta.author', 'test')
    expect(parseXml(fsUtils.write.mock.calls[0][1]).root.meta.author).toBe('test')
  })

  it('deletes a node when value is undefined', async () => {
    const fsUtils = makeFsUtils({ 'pom.xml': SIMPLE_XML })
    const xml = createXmlUtils('/project', fsUtils)
    await xml.writePath('pom.xml', '$.project.version', undefined)
    const result = parseXml(fsUtils.write.mock.calls[0][1])
    expect(result.project.version).toBeUndefined()
  })

  it('throws when file is missing', async () => {
    const fsUtils = makeFsUtils()
    const xml = createXmlUtils('/project', fsUtils)
    await expect(xml.writePath('missing.xml', '$.root.name', 'test')).rejects.toThrow('missing XML file')
  })
})
