import path from 'node:path'
import { createReadStream } from 'node:fs'
import { Transform } from 'node:stream'
import { parse as csvParse } from 'csv-parse'
import { stringify as csvStringify } from 'csv-stringify'
import { parse as csvParseSync } from 'csv-parse/sync'
import { stringify as csvStringifySync } from 'csv-stringify/sync'

class CsvParseError extends Error {
  constructor(message, filePath) {
    super(message)
    this.name = 'CsvParseError'
    this.filePath = filePath
  }
}

function normalizeKey(header) {
  const s = header
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^[^a-zA-Z_$]/, '_')
    .replace(/[^a-zA-Z0-9_$]/g, '')
  if (!s) return '_'
  return s[0].toLowerCase() + s.slice(1)
}

function buildAliases(columns, aliasMap) {
  const result = {}
  for (const col of columns) {
    const alias = aliasMap ? (aliasMap[col] ?? normalizeKey(col)) : normalizeKey(col)
    result[alias] = col
  }
  return result
}

function applyAliases(row, aliases) {
  const result = {}
  for (const [alias, original] of Object.entries(aliases)) {
    result[alias] = row[original]
  }
  return result
}

function buildParseOpts(opts = {}) {
  return {
    delimiter: opts.delimiter ?? ',',
    quote: opts.quote ?? '"',
    comment: opts.comment ?? null,
    skip_empty_lines: opts.skipEmptyLines ?? true,
    cast: opts.cast ?? false,
    from_line: opts.skipHeader ? 2 : 1,
  }
}

// Applies from/to (1-indexed, negative = from end) to an array of rows.
function sliceRows(rows, opts) {
  const { from, to } = opts
  if (from == null && to == null) return rows
  const len = rows.length
  const start = from == null ? 0 : from >= 0 ? from - 1 : Math.max(0, len + from)
  const end   = to   == null ? len : to >= 0 ? to : Math.max(0, len + to + 1)
  return rows.slice(start, end)
}

export function createCsvUtils(dir, fsUtils) {
  async function read(relPath, opts = {}) {
    const { throw: shouldThrow = true, from, to, ...parseOpts } = opts
    const text = await fsUtils.read(relPath, { throw: shouldThrow })
    if (text === null) return null
    const displayPath = path.join(dir, relPath)
    try {
      const rows = csvParseSync(text, buildParseOpts(parseOpts))
      return sliceRows(rows, { from, to })
    } catch (err) {
      if (!shouldThrow) return null
      throw new CsvParseError(`Failed to parse ${displayPath}:\n  ${err.message}`, displayPath)
    }
  }

  async function write(relPath, rows, opts = {}) {
    const content = await new Promise((resolve, reject) => {
      csvStringify(rows, {
        delimiter: opts.delimiter ?? ',',
        quote: opts.quote ?? '"',
      }, (err, output) => {
        if (err) reject(err)
        else resolve(output)
      })
    })
    await fsUtils.write(relPath, content)
  }

  async function readObjects(relPath, opts = {}) {
    const { throw: shouldThrow = true, aliases: aliasMap, columns: suppliedColumns, from, to, ...parseOpts } = opts
    const text = await fsUtils.read(relPath, { throw: shouldThrow })
    if (text === null) return null
    const displayPath = path.join(dir, relPath)

    const csvOpts = {
      ...buildParseOpts(parseOpts),
      columns: suppliedColumns ?? true,
    }

    let records
    try {
      records = csvParseSync(text, csvOpts)
    } catch (err) {
      if (!shouldThrow) return null
      throw new CsvParseError(`Failed to parse ${displayPath}:\n  ${err.message}`, displayPath)
    }

    const columns = suppliedColumns ?? (records.length > 0 ? Object.keys(records[0]) : [])
    const aliases = buildAliases(columns, aliasMap)
    const sliced = sliceRows(records, { from, to })
    const rows = sliced.map(record => applyAliases(record, aliases))

    return { columns, rows, aliases }
  }

  async function writeObjects(relPath, data, opts = {}) {
    const isCsvObject = data && !Array.isArray(data) && 'columns' in data && 'rows' in data && 'aliases' in data

    let records, columns
    if (isCsvObject) {
      columns = data.columns
      records = data.rows.map(row => {
        const record = {}
        for (const [alias, original] of Object.entries(data.aliases)) {
          record[original] = row[alias]
        }
        return record
      })
    } else {
      records = data
      columns = opts.columns ?? (records.length > 0 ? Object.keys(records[0]) : [])
    }

    const header = opts.header ?? true

    const content = await new Promise((resolve, reject) => {
      csvStringify(records, {
        delimiter: opts.delimiter ?? ',',
        quote: opts.quote ?? '"',
        columns,
        header,
      }, (err, output) => {
        if (err) reject(err)
        else resolve(output)
      })
    })

    await fsUtils.write(relPath, content)
  }

  function parse(content, opts = {}) {
    const { throw: shouldThrow = true, ...parseOpts } = opts
    try {
      return csvParseSync(content, buildParseOpts(parseOpts))
    } catch (err) {
      if (!shouldThrow) return null
      throw new CsvParseError(`Failed to parse CSV string:\n  ${err.message}`)
    }
  }

  function parseObjects(content, opts = {}) {
    const { throw: shouldThrow = true, aliases: aliasMap, columns: suppliedColumns, ...parseOpts } = opts
    const csvOpts = { ...buildParseOpts(parseOpts), columns: suppliedColumns ?? true }
    let records
    try {
      records = csvParseSync(content, csvOpts)
    } catch (err) {
      if (!shouldThrow) return null
      throw new CsvParseError(`Failed to parse CSV string:\n  ${err.message}`)
    }
    const columns = suppliedColumns ?? (records.length > 0 ? Object.keys(records[0]) : [])
    const aliases = buildAliases(columns, aliasMap)
    const rows = records.map(record => applyAliases(record, aliases))
    return { columns, rows, aliases }
  }

  function stringify(rows, opts = {}) {
    return csvStringifySync(rows, {
      delimiter: opts.delimiter ?? ',',
      quote: opts.quote ?? '"',
    })
  }

  function stringifyObjects(data, opts = {}) {
    const isCsvObject = data && !Array.isArray(data) && 'columns' in data && 'rows' in data && 'aliases' in data
    let records, columns
    if (isCsvObject) {
      columns = data.columns
      records = data.rows.map(row => {
        const record = {}
        for (const [alias, original] of Object.entries(data.aliases)) {
          record[original] = row[alias]
        }
        return record
      })
    } else {
      records = data
      columns = opts.columns ?? (records.length > 0 ? Object.keys(records[0]) : [])
    }
    return csvStringifySync(records, {
      delimiter: opts.delimiter ?? ',',
      quote: opts.quote ?? '"',
      columns,
      header: opts.header ?? true,
    })
  }

  async function headers(relPath, opts = {}) {
    const { throw: shouldThrow = true, delimiter = ',', quote = '"' } = opts
    const text = await fsUtils.read(relPath, { throw: shouldThrow })
    if (text === null) return null
    const displayPath = path.join(dir, relPath)
    try {
      const rows = csvParseSync(text, { delimiter, quote, skip_empty_lines: true, to_line: 1 })
      return rows.length > 0 ? rows[0] : []
    } catch (err) {
      if (!shouldThrow) return null
      throw new CsvParseError(`Failed to parse ${displayPath}:\n  ${err.message}`, displayPath)
    }
  }

  async function count(relPath, opts = {}) {
    const { throw: shouldThrow = true, delimiter = ',', quote = '"' } = opts
    const text = await fsUtils.read(relPath, { throw: shouldThrow })
    if (text === null) return null
    const displayPath = path.join(dir, relPath)
    try {
      const rows = csvParseSync(text, { delimiter, quote, skip_empty_lines: true, from_line: 2 })
      return rows.length
    } catch (err) {
      if (!shouldThrow) return null
      throw new CsvParseError(`Failed to parse ${displayPath}:\n  ${err.message}`, displayPath)
    }
  }

  async function append(relPath, rows, opts = {}) {
    const content = await new Promise((resolve, reject) => {
      csvStringify(rows, {
        delimiter: opts.delimiter ?? ',',
        quote: opts.quote ?? '"',
      }, (err, output) => {
        if (err) reject(err)
        else resolve(output)
      })
    })
    await fsUtils.append(relPath, content)
  }

  async function appendObjects(relPath, data, opts = {}) {
    const isCsvObject = data && !Array.isArray(data) && 'columns' in data && 'rows' in data && 'aliases' in data

    // Determine column order from existing file headers, fall back to data schema
    const existingHeaders = await fsUtils.read(relPath, { throw: false })
    let columns
    if (existingHeaders) {
      try {
        const firstRow = csvParseSync(existingHeaders, {
          delimiter: opts.delimiter ?? ',',
          quote: opts.quote ?? '"',
          skip_empty_lines: true,
          to_line: 1,
        })
        columns = firstRow.length > 0 ? firstRow[0] : null
      } catch {
        columns = null
      }
    }

    let records
    if (isCsvObject) {
      if (!columns) columns = data.columns
      records = data.rows.map(row => {
        const record = {}
        for (const [alias, original] of Object.entries(data.aliases)) {
          record[original] = row[alias]
        }
        return record
      })
    } else {
      records = data
      if (!columns) columns = records.length > 0 ? Object.keys(records[0]) : []
    }

    const content = await new Promise((resolve, reject) => {
      csvStringify(records, {
        delimiter: opts.delimiter ?? ',',
        quote: opts.quote ?? '"',
        columns,
        header: false,
      }, (err, output) => {
        if (err) reject(err)
        else resolve(output)
      })
    })

    await fsUtils.append(relPath, content)
  }

  function readStreamIter(relPath, opts = {}) {
    const { throw: _t, ...parseOpts } = opts
    const absPath = path.resolve(dir, relPath)
    const parser = csvParse(buildParseOpts(parseOpts))
    const fileStream = createReadStream(absPath)
    fileStream.on('error', err => parser.destroy(err))
    fileStream.pipe(parser)
    return parser
  }

  function readObjectsStreamIter(relPath, opts = {}) {
    const { throw: _t, aliases: aliasMap, columns: suppliedColumns, ...parseOpts } = opts
    const absPath = path.resolve(dir, relPath)
    const csvOpts = { ...buildParseOpts(parseOpts), columns: suppliedColumns ?? true }
    const parser = csvParse(csvOpts)

    let resolveColumns, resolveAliases
    const columnsPromise = new Promise(res => { resolveColumns = res })
    const aliasesPromise = new Promise(res => { resolveAliases = res })

    let headersSent = false
    let resolvedAliases = null

    const rowTransform = new Transform({
      objectMode: true,
      transform(record, _enc, callback) {
        if (!headersSent) {
          headersSent = true
          const columns = suppliedColumns ?? Object.keys(record)
          resolvedAliases = buildAliases(columns, aliasMap)
          resolveColumns(columns)
          resolveAliases(resolvedAliases)
        }
        this.push(applyAliases(record, resolvedAliases))
        callback()
      }
    })

    const fileStream = createReadStream(absPath)
    fileStream.on('error', err => parser.destroy(err))
    parser.on('error', err => rowTransform.destroy(err))
    fileStream.pipe(parser).pipe(rowTransform)

    return { columns: columnsPromise, aliases: aliasesPromise, rows: rowTransform }
  }

  function writeStreamRef(relPath, opts = {}) {
    const chunks = []
    const stringifier = csvStringify({
      delimiter: opts.delimiter ?? ',',
      quote: opts.quote ?? '"',
    })
    stringifier.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk.toString() : chunk))

    return {
      write(row) {
        return new Promise((resolve, reject) => {
          stringifier.write(row, err => {
            if (err) reject(err)
            else resolve()
          })
        })
      },
      close() {
        return new Promise((resolve, reject) => {
          stringifier.end()
          stringifier.on('finish', () => {
            fsUtils.write(relPath, chunks.join('')).then(resolve).catch(reject)
          })
          stringifier.on('error', reject)
        })
      }
    }
  }

  function writeObjectsStreamRef(relPath, opts = {}) {
    let columns = opts.columns ?? null
    const header = opts.header ?? true
    let stringifier = null
    const chunks = []

    const proxy = new Transform({
      objectMode: true,
      transform(record, _enc, callback) {
        if (!stringifier) {
          if (!columns) columns = Object.keys(record)
          stringifier = csvStringify({ delimiter: opts.delimiter ?? ',', quote: opts.quote ?? '"', columns, header })
          stringifier.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk.toString() : chunk))
        }
        stringifier.write(record)
        callback()
      },
      flush(callback) {
        if (!stringifier) { callback(); return }
        stringifier.end()
        stringifier.on('finish', () => {
          fsUtils.write(relPath, chunks.join('')).then(() => callback()).catch(callback)
        })
      }
    })

    return {
      write(record) {
        return new Promise((resolve, reject) => {
          proxy.write(record, err => {
            if (err) reject(err)
            else resolve()
          })
        })
      },
      close() {
        return new Promise((resolve, reject) => {
          proxy.end(err => {
            if (err) reject(err)
            else resolve()
          })
        })
      }
    }
  }

  return {
    read,
    write,
    readObjects,
    writeObjects,
    headers,
    count,
    append,
    appendObjects,
    parse,
    parseObjects,
    stringify,
    stringifyObjects,
    readStreamIter,
    readObjectsStreamIter,
    writeStreamRef,
    writeObjectsStreamRef,
  }
}
