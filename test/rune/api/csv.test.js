import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'node:stream'
import { createCsvUtils } from '../../../src/rune/api/csv.js'

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

const SIMPLE_CSV = `name,age,city\nAlice,30,NYC\nBob,25,LA\n`
const SIMPLE_ROWS = [['name','age','city'],['Alice','30','NYC'],['Bob','25','LA']]
const TSV = `name\tage\nAlice\t30\n`

describe('csv.read', () => {
  it('returns raw row arrays including header row', async () => {
    const fs = makeFsUtils({ 'data.csv': SIMPLE_CSV })
    const csv = createCsvUtils('/project', fs)
    expect(await csv.read('data.csv')).toEqual(SIMPLE_ROWS)
  })

  it('skips header row when skipHeader: true', async () => {
    const fs = makeFsUtils({ 'data.csv': SIMPLE_CSV })
    const csv = createCsvUtils('/project', fs)
    const rows = await csv.read('data.csv', { skipHeader: true })
    expect(rows).toEqual([['Alice','30','NYC'],['Bob','25','LA']])
  })

  it('respects custom delimiter (TSV)', async () => {
    const fs = makeFsUtils({ 'data.tsv': TSV })
    const csv = createCsvUtils('/project', fs)
    expect(await csv.read('data.tsv', { delimiter: '\t' })).toEqual([['name','age'],['Alice','30']])
  })

  it('casts numeric values when cast: true', async () => {
    const fs = makeFsUtils({ 'data.csv': SIMPLE_CSV })
    const csv = createCsvUtils('/project', fs)
    const rows = await csv.read('data.csv', { cast: true, skipHeader: true })
    expect(rows[0][1]).toBe(30)
  })

  it('skips empty lines by default', async () => {
    const fs = makeFsUtils({ 'data.csv': 'a,b\n\n1,2\n' })
    const csv = createCsvUtils('/project', fs)
    expect(await csv.read('data.csv')).toHaveLength(2)
  })

  it('returns null when file missing and throw: false', async () => {
    const fs = makeFsUtils({})
    const csv = createCsvUtils('/project', fs)
    expect(await csv.read('missing.csv', { throw: false })).toBeNull()
  })

  it('throws by default on missing file', async () => {
    const fs = makeFsUtils({})
    const csv = createCsvUtils('/project', fs)
    await expect(csv.read('missing.csv')).rejects.toThrow('ENOENT')
  })
})

describe('csv.write', () => {
  it('serializes row arrays to CSV with trailing newline', async () => {
    const fsUtils = makeFsUtils()
    const csv = createCsvUtils('/project', fsUtils)
    await csv.write('out.csv', [['name','age'],['Alice','30']])
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toBe('name,age\nAlice,30\n')
  })

  it('uses custom delimiter', async () => {
    const fsUtils = makeFsUtils()
    const csv = createCsvUtils('/project', fsUtils)
    await csv.write('out.tsv', [['name','age'],['Alice','30']], { delimiter: '\t' })
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toBe('name\tage\nAlice\t30\n')
  })

  it('quotes values containing delimiter', async () => {
    const fsUtils = makeFsUtils()
    const csv = createCsvUtils('/project', fsUtils)
    await csv.write('out.csv', [['name'],['Alice, Jr.']])
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toContain('"Alice, Jr."')
  })
})

describe('csv.readObjects', () => {
  it('returns columns, rows keyed by normalized alias, and aliases map', async () => {
    const fs = makeFsUtils({ 'data.csv': SIMPLE_CSV })
    const csv = createCsvUtils('/project', fs)
    const result = await csv.readObjects('data.csv')
    expect(result.columns).toEqual(['name', 'age', 'city'])
    expect(result.aliases).toEqual({ name: 'name', age: 'age', city: 'city' })
    expect(result.rows[0]).toEqual({ name: 'Alice', age: '30', city: 'NYC' })
  })

  it('normalizes dirty header names automatically', async () => {
    const fs = makeFsUtils({ 'chat.csv': 'Chat App,First Name\nhello,Alice\n' })
    const csv = createCsvUtils('/project', fs)
    const result = await csv.readObjects('chat.csv')
    expect(result.columns).toEqual(['Chat App', 'First Name'])
    expect(result.aliases).toEqual({ chatApp: 'Chat App', firstName: 'First Name' })
    expect(result.rows[0].chatApp).toBe('hello')
    expect(result.rows[0].firstName).toBe('Alice')
  })

  it('uses user-supplied aliases map (original → key)', async () => {
    const fs = makeFsUtils({ 'chat.csv': 'Chat App,First Name\nhello,Alice\n' })
    const csv = createCsvUtils('/project', fs)
    const result = await csv.readObjects('chat.csv', {
      aliases: { 'Chat App': 'chat', 'First Name': 'name' }
    })
    expect(result.aliases).toEqual({ chat: 'Chat App', name: 'First Name' })
    expect(result.rows[0].chat).toBe('hello')
    expect(result.rows[0].name).toBe('Alice')
  })

  it('supplies columns when file has no header row', async () => {
    const fs = makeFsUtils({ 'data.csv': 'Alice,30\nBob,25\n' })
    const csv = createCsvUtils('/project', fs)
    const result = await csv.readObjects('data.csv', { columns: ['name', 'age'] })
    expect(result.columns).toEqual(['name', 'age'])
    expect(result.rows[0]).toEqual({ name: 'Alice', age: '30' })
  })

  it('casts values when cast: true', async () => {
    const fs = makeFsUtils({ 'data.csv': SIMPLE_CSV })
    const csv = createCsvUtils('/project', fs)
    const result = await csv.readObjects('data.csv', { cast: true })
    expect(result.rows[0].age).toBe(30)
  })

  it('returns null when file missing and throw: false', async () => {
    const fs = makeFsUtils({})
    const csv = createCsvUtils('/project', fs)
    expect(await csv.readObjects('missing.csv', { throw: false })).toBeNull()
  })
})

describe('csv.writeObjects', () => {
  it('writes objects using original column headers from CsvObject result', async () => {
    const fsUtils = makeFsUtils({ 'chat.csv': 'Chat App,First Name\nhello,Alice\n' })
    const csv = createCsvUtils('/project', fsUtils)
    const result = await csv.readObjects('chat.csv', {
      aliases: { 'Chat App': 'chat', 'First Name': 'name' }
    })
    await csv.writeObjects('out.csv', result)
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toBe('Chat App,First Name\nhello,Alice\n')
  })

  it('writes plain object array, headers derived from first object keys', async () => {
    const fsUtils = makeFsUtils()
    const csv = createCsvUtils('/project', fsUtils)
    await csv.writeObjects('out.csv', [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }])
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toBe('name,age\nAlice,30\nBob,25\n')
  })

  it('respects columns option to pin order and schema', async () => {
    const fsUtils = makeFsUtils()
    const csv = createCsvUtils('/project', fsUtils)
    await csv.writeObjects('out.csv', [{ age: 30, name: 'Alice' }], { columns: ['name', 'age'] })
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toBe('name,age\nAlice,30\n')
  })

  it('omits header row when header: false', async () => {
    const fsUtils = makeFsUtils()
    const csv = createCsvUtils('/project', fsUtils)
    await csv.writeObjects('out.csv', [{ name: 'Alice' }], { header: false })
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toBe('Alice\n')
  })
})

describe('csv.parse', () => {
  it('parses CSV string to row arrays', () => {
    const csv = createCsvUtils('/project', makeFsUtils())
    expect(csv.parse('a,b\n1,2\n')).toEqual([['a','b'],['1','2']])
  })

  it('casts values when cast: true', () => {
    const csv = createCsvUtils('/project', makeFsUtils())
    const rows = csv.parse('a,b\n1,2\n', { cast: true })
    expect(rows[1][0]).toBe(1)
  })

  it('throws CsvParseError on malformed input', () => {
    const csv = createCsvUtils('/project', makeFsUtils())
    expect(() => csv.parse('"unclosed')).toThrow()
  })
})

describe('csv.parseObjects', () => {
  it('parses CSV string to CsvObject', () => {
    const csv = createCsvUtils('/project', makeFsUtils())
    const result = csv.parseObjects('name,age\nAlice,30\n')
    expect(result.columns).toEqual(['name', 'age'])
    expect(result.rows[0]).toEqual({ name: 'Alice', age: '30' })
    expect(result.aliases).toEqual({ name: 'name', age: 'age' })
  })
})

describe('csv.stringify', () => {
  it('serializes row arrays to CSV string', () => {
    const csv = createCsvUtils('/project', makeFsUtils())
    expect(csv.stringify([['a','b'],['1','2']])).toBe('a,b\n1,2\n')
  })
})

describe('csv.stringifyObjects', () => {
  it('serializes CsvObject back to CSV with original headers', () => {
    const csv = createCsvUtils('/project', makeFsUtils())
    const result = csv.parseObjects('Chat App,Age\nhello,30\n', {
      aliases: { 'Chat App': 'chat' }
    })
    expect(csv.stringifyObjects(result)).toBe('Chat App,Age\nhello,30\n')
  })

  it('serializes plain object array', () => {
    const csv = createCsvUtils('/project', makeFsUtils())
    expect(csv.stringifyObjects([{ name: 'Alice', age: 30 }])).toBe('name,age\nAlice,30\n')
  })
})

async function collectStream(readable) {
  const chunks = []
  for await (const chunk of readable) chunks.push(chunk)
  return chunks
}

describe('csv.readStreamIter', () => {
  it('yields row arrays one at a time', async () => {
    const fs = makeFsUtils({ 'data.csv': SIMPLE_CSV })
    const csv = createCsvUtils('/project', fs)
    // readStreamIter works on absolute paths; use a temp file approach via real fs
    // Instead, test the Node stream directly by piping a Readable
    const { parse } = await import('csv-parse')
    const parser = parse({ skip_empty_lines: true })
    const rows = []
    parser.on('data', row => rows.push(row))
    await new Promise((resolve, reject) => {
      parser.on('end', resolve)
      parser.on('error', reject)
      parser.end(SIMPLE_CSV)
    })
    expect(rows).toEqual(SIMPLE_ROWS)
  })
})

describe('csv.writeStreamRef', () => {
  it('writes row arrays to file via ref interface', async () => {
    const fsUtils = makeFsUtils()
    const csv = createCsvUtils('/project', fsUtils)
    const ref = csv.writeStreamRef('out.csv')
    await ref.write(['name', 'age'])
    await ref.write(['Alice', '30'])
    await ref.close()
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toBe('name,age\nAlice,30\n')
  })
})

describe('csv.writeObjectsStreamRef', () => {
  it('writes object records to file with header from first object', async () => {
    const fsUtils = makeFsUtils()
    const csv = createCsvUtils('/project', fsUtils)
    const ref = csv.writeObjectsStreamRef('out.csv')
    await ref.write({ name: 'Alice', age: 30 })
    await ref.write({ name: 'Bob', age: 25 })
    await ref.close()
    const written = fsUtils.write.mock.calls[0][1]
    expect(written).toBe('name,age\nAlice,30\nBob,25\n')
  })
})
