/** Read, write, parse, and stream CSV and TSV data */
declare namespace csv {

  interface CsvObject {
    /** Original header names as they appear in the file */
    columns: string[]
    /** Rows keyed by alias (normalized or user-supplied) */
    rows: Record<string, unknown>[]
    /** Alias → original header map: { chatApp: 'Chat App' } */
    aliases: Record<string, string>
  }

  interface CsvObjectStream {
    /** Resolves with original header names after the first row is parsed */
    columns: Promise<string[]>
    /** Resolves with the alias → original map after the first row is parsed */
    aliases: Promise<Record<string, string>>
    /** Stream of row objects keyed by alias */
    rows: ReadableStream<Record<string, unknown>>
  }

  interface CsvReadOpts {
    /** Column separator. Default: ',' */
    delimiter?: string
    /** Quote character. Default: '"' */
    quote?: string
    /** Line comment character. Default: none */
    comment?: string
    /** Skip empty lines. Default: true */
    skipEmptyLines?: boolean
    /** Auto-cast numbers and booleans. Default: false */
    cast?: boolean
    /** Discard the first (header) row. Default: false */
    skipHeader?: boolean
    /** Throw on parse failure (default: true). false returns null on total failure. */
    throw?: boolean
  }

  interface CsvReadObjectsOpts extends CsvReadOpts {
    /** Supply header names when the file has no header row. */
    columns?: string[]
    /** Map original header names to desired alias keys: { 'Chat App': 'chat' }. Auto-normalizes if absent. */
    aliases?: Record<string, string>
  }

  interface CsvWriteOpts {
    /** Column separator. Default: ',' */
    delimiter?: string
    /** Quote character. Default: '"' */
    quote?: string
    /** Pin column order and schema */
    columns?: string[]
    /** Include header row. Default: true */
    header?: boolean
  }

  /**
   * Reads a CSV file and returns raw row arrays (including header row).
   * Requires `fs.read:<path>` permission.
   */
  function read(path: string, opts?: CsvReadOpts): Promise<string[][] | null>

  /**
   * Reads a CSV file and returns a CsvObject with columns, aliased rows, and aliases map.
   * Requires `fs.read:<path>` permission.
   */
  function readObjects(path: string, opts?: CsvReadObjectsOpts): Promise<CsvObject | null>

  /**
   * Writes row arrays to a CSV file.
   * Requires `fs.write:<path>` permission.
   */
  function write(path: string, rows: string[][], opts?: CsvWriteOpts): Promise<void>

  /**
   * Writes objects to a CSV file.
   * Accepts a CsvObject (round-trips original headers) or a plain Record array.
   * Requires `fs.write:<path>` permission.
   */
  function writeObjects(path: string, data: CsvObject | Record<string, unknown>[], opts?: CsvWriteOpts): Promise<void>

  /** Parse a CSV string into row arrays (synchronous). */
  function parse(content: string, opts?: CsvReadOpts): string[][] | null

  /** Parse a CSV string into a CsvObject (synchronous). */
  function parseObjects(content: string, opts?: CsvReadObjectsOpts): CsvObject | null

  /** Serialize row arrays to a CSV string (synchronous). */
  function stringify(rows: string[][], opts?: CsvWriteOpts): string

  /** Serialize a CsvObject or plain Record array to a CSV string (synchronous). */
  function stringifyObjects(data: CsvObject | Record<string, unknown>[], opts?: CsvWriteOpts): string

  /**
   * Stream a CSV file row-by-row as string arrays.
   * Requires `fs.read:<path>` permission.
   */
  function readStream(path: string, opts?: CsvReadOpts): ReadableStream<string[]>

  /**
   * Stream a CSV file row-by-row as aliased objects.
   * columns and aliases resolve as promises after the first row is parsed.
   * Requires `fs.read:<path>` permission.
   */
  function readObjectsStream(path: string, opts?: CsvReadObjectsOpts): CsvObjectStream

  /**
   * WritableStream that serializes row arrays and writes to a CSV file.
   * Requires `fs.write:<path>` permission.
   */
  function writeStream(path: string, opts?: CsvWriteOpts): WritableStream<string[]>

  /**
   * WritableStream that serializes Record objects and writes to a CSV file.
   * Requires `fs.write:<path>` permission.
   */
  function writeObjectsStream(path: string, opts?: CsvWriteOpts): WritableStream<Record<string, unknown>>
}
