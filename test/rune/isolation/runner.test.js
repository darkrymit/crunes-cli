import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { getPluginRunePath, runRuneInIsolate, getArgsSchema } from '../../../src/rune/isolation/runner.js'

describe('getPluginRunePath', () => {
  it('uses convention runes/<key>.js when plugin.json has no path', () => {
    const pluginJson = { runes: { hello: { permissions: { use: { allow: [] } } } } }
    expect(getPluginRunePath('/plugin', 'hello', pluginJson))
      .toBe(join('/plugin', 'runes/hello.js'))
  })

  it('uses custom path when rune entry declares path', () => {
    const pluginJson = { runes: { hello: { path: 'lib/runes/hello.js', permissions: { use: { allow: [] } } } } }
    expect(getPluginRunePath('/plugin', 'hello', pluginJson))
      .toBe(join('/plugin', 'lib/runes/hello.js'))
  })

  it('handles missing rune entry gracefully (falls back to convention)', () => {
    const pluginJson = { runes: {} }
    expect(getPluginRunePath('/plugin', 'hello', pluginJson))
      .toBe(join('/plugin', 'runes/hello.js'))
  })
})

describe('@utils virtual module', () => {
  let tmp

  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-runner-utils-')) })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('resolves @utils import and calls use(args)', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function use(args) {',
      '  return [section.create("test", { type: "markdown", content: args._[0] ?? "hi" })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, ['world'], tmp)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ name: 'test', data: { content: 'world' } })
  })

  it('fs.cwd() returns absolute project dir', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { fs, section } from "@utils"',
      'export async function use(args) {',
      '  return [section.create("cwd", { type: "markdown", content: fs.cwd() })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    expect(result[0]).toMatchObject({ name: 'cwd', data: { content: tmp } })
  })
})

describe('getArgsSchema', () => {
  let tmp

  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-runner-schema-')) })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('returns null when rune has no args export', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function use(args) { return [] }',
    ].join('\n'))
    expect(await getArgsSchema(runeFile, { allow: [], deny: [] }, tmp)).toBeNull()
  })

  it('returns schema when rune exports args()', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'export async function args(b) {',
      '  return b.option("--strict", "Strict mode", false).build()',
      '}',
      'export async function use(args) { return [] }',
    ].join('\n'))
    const schema = await getArgsSchema(runeFile, { allow: [], deny: [] }, tmp)
    expect(schema).toMatchObject({
      options: [{ flags: '--strict', description: 'Strict mode', def: false }],
    })
  })

  it('args() can import from @utils', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function args(b) {',
      '  return b.option("-c, --count <number>", "Count", 5).build()',
      '}',
      'export async function use(args) { return [] }',
    ].join('\n'))
    const schema = await getArgsSchema(runeFile, { allow: [], deny: [] }, tmp)
    expect(schema.options[0].def).toBe(5)
  })

  it('returns examples when args() calls .example()', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'export async function args(b) {',
      '  return b',
      '    .option("--strict", "Strict", false)',
      '    .example("crunes use myrune foo", "Basic use")',
      '    .example("crunes use myrune foo --strict")',
      '    .build()',
      '}',
      'export async function use(args) { return [] }',
    ].join('\n'))
    const schema = await getArgsSchema(runeFile, { allow: [], deny: [] }, tmp)
    expect(schema.examples).toHaveLength(2)
    expect(schema.examples[0]).toMatchObject({ usage: 'crunes use myrune foo', description: 'Basic use' })
    expect(schema.examples[1]).toMatchObject({ usage: 'crunes use myrune foo --strict' })
  })
})

describe('runRuneInIsolate — declarative args parsing', () => {
  let tmp

  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-runner-decl-')) })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('use(args) receives best-effort parsed object when no args() export', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function use(args) {',
      '  return [section.create("t", { type: "markdown", content: JSON.stringify({ pos: args._, raw: args.$raw }) })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, ['hello'], tmp)
    const data = JSON.parse(result[0].data.content)
    expect(data.pos).toContain('hello')
    expect(data.raw).toEqual(['hello'])
  })

  it('use(args) receives schema-parsed object when args() is exported', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function args(b) {',
      '  return b.option("-c, --count <number>", "Count", 0).build()',
      '}',
      'export async function use(parsed) {',
      '  return [section.create("t", { type: "markdown", content: String(parsed.count) })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, ['-c', '7'], tmp)
    expect(result[0].data.content).toBe('7')
  })

  it('args.$raw contains original raw array', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function use(args) {',
      '  return [section.create("t", { type: "markdown", content: JSON.stringify(args.$raw) })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, ['a', 'b'], tmp)
    expect(JSON.parse(result[0].data.content)).toEqual(['a', 'b'])
  })

  it('schema default is applied when flag is absent', async () => {
    const runeFile = join(tmp, 'rune.js')
    await writeFile(runeFile, [
      'import { section } from "@utils"',
      'export async function args(b) {',
      '  return b.option("--strict", "Strict", false).build()',
      '}',
      'export async function use(parsed) {',
      '  return [section.create("t", { type: "markdown", content: String(parsed.strict) })]',
      '}',
    ].join('\n'))
    const result = await runRuneInIsolate(runeFile, { allow: [], deny: [] }, [], tmp)
    expect(result[0].data.content).toBe('false')
  })
})
