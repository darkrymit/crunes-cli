import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
  computeHash,
  readSchemaCache,
  writeSchemaCache,
  listSchemaCaches,
  deleteSchemaCache,
} from '../../src/rune/schema-cache.js'

describe('schema-cache', () => {
  let tmp, projectDir, runeFile

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-sc-'))
    projectDir = tmp
    runeFile = join(tmp, 'my-rune.js')
    await writeFile(runeFile, `export function args(b) { return b.option('--verbose', 'v', false) }`)
  })

  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('computeHash returns a stable string for same file+vars', async () => {
    const h1 = await computeHash(runeFile, { foo: 'bar' })
    const h2 = await computeHash(runeFile, { foo: 'bar' })
    expect(h1).toBe(h2)
    expect(typeof h1).toBe('string')
    expect(h1).toContain(':')
  })

  it('computeHash differs when file content changes', async () => {
    const h1 = await computeHash(runeFile, {})
    await writeFile(runeFile, `export function args(b) { return b.option('--count', 'c', 0) }`)
    const h2 = await computeHash(runeFile, {})
    expect(h1).not.toBe(h2)
  })

  it('computeHash differs when vars change', async () => {
    const h1 = await computeHash(runeFile, { env: 'prod' })
    const h2 = await computeHash(runeFile, { env: 'dev' })
    expect(h1).not.toBe(h2)
  })

  it('computeHash is stable regardless of vars key insertion order', async () => {
    const h1 = await computeHash(runeFile, { b: '2', a: '1' })
    const h2 = await computeHash(runeFile, { a: '1', b: '2' })
    expect(h1).toBe(h2)
  })

  it('readSchemaCache returns undefined on miss (no file)', async () => {
    const result = await readSchemaCache('my-rune', 'args', runeFile, {}, projectDir)
    expect(result).toBeUndefined()
  })

  it('writeSchemaCache then readSchemaCache returns the schema on hit', async () => {
    const schema = { options: [{ flags: '--verbose', description: 'v', def: false }], positionals: [], examples: [], commands: [] }
    await writeSchemaCache('my-rune', 'args', runeFile, {}, schema, projectDir)
    const result = await readSchemaCache('my-rune', 'args', runeFile, {}, projectDir)
    expect(result).toEqual(schema)
  })

  it('writeSchemaCache accepts null schema (no export) and returns null on hit', async () => {
    await writeSchemaCache('my-rune', 'args', runeFile, {}, null, projectDir)
    const result = await readSchemaCache('my-rune', 'args', runeFile, {}, projectDir)
    expect(result).toBeNull()
  })

  it('readSchemaCache returns undefined when file content has changed (hash mismatch)', async () => {
    await writeSchemaCache('my-rune', 'args', runeFile, {}, null, projectDir)
    await writeFile(runeFile, `export function args(b) { return b.option('--count', 'c', 0) }`)
    const result = await readSchemaCache('my-rune', 'args', runeFile, {}, projectDir)
    expect(result).toBeUndefined()
  })

  it('readSchemaCache returns undefined when vars have changed (hash mismatch)', async () => {
    await writeSchemaCache('my-rune', 'args', runeFile, { env: 'prod' }, null, projectDir)
    const result = await readSchemaCache('my-rune', 'args', runeFile, { env: 'dev' }, projectDir)
    expect(result).toBeUndefined()
  })

  it('writeSchemaCache uses safe filename (colon replaced with __)', async () => {
    await writeSchemaCache('myplugin:my-rune', 'args', runeFile, {}, null, projectDir)
    const files = await readdir(join(projectDir, '.crunes', 'schemas'))
    expect(files.some(f => f.includes('myplugin__my-rune'))).toBe(true)
    expect(files.some(f => f.includes(':'))).toBe(false)
  })

  it('listSchemaCaches returns entries for written files', async () => {
    const schema = { options: [], positionals: [], examples: [], commands: [] }
    await writeSchemaCache('my-rune', 'args', runeFile, {}, schema, projectDir)
    await writeSchemaCache('my-rune', 'argsRepl', runeFile, {}, null, projectDir)
    const entries = await listSchemaCaches(projectDir)
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.type).sort()).toEqual(['args', 'argsRepl'].sort())
    expect(entries[0].runeKey).toBe('my-rune')
    expect(entries[0].cachedAt).toBeTruthy()
    expect(entries[0].hash).toBeTruthy()
    expect(entries[0].filePath).toBeTruthy()
  })

  it('listSchemaCaches returns empty array when schemas dir is absent', async () => {
    const entries = await listSchemaCaches(projectDir)
    expect(entries).toEqual([])
  })

  it('deleteSchemaCache removes all type files for the rune key', async () => {
    await writeSchemaCache('my-rune', 'args', runeFile, {}, null, projectDir)
    await writeSchemaCache('my-rune', 'argsRepl', runeFile, {}, null, projectDir)
    await writeSchemaCache('my-rune', 'commandsRepl', runeFile, {}, null, projectDir)
    await deleteSchemaCache('my-rune', projectDir)
    const entries = await listSchemaCaches(projectDir)
    expect(entries).toEqual([])
  })

  it('deleteSchemaCache does not throw when files are absent', async () => {
    await expect(deleteSchemaCache('nonexistent-rune', projectDir)).resolves.toBeUndefined()
  })
})
