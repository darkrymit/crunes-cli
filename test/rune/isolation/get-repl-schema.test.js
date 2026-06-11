import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { getReplSchema } from '../../../src/rune/isolation/runner.js'

describe('getReplSchema', () => {
  let tmp
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-rschema-')) })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  const effective = { allow: [], deny: [] }

  it('returns argsSchema from argsRepl(builder)', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export function argsRepl(b) {
        return b.option('--db <path>', 'DB path', './state').build()
      }
      export async function inputRepl(input) { return { type: 'done' } }
    `)
    const result = await getReplSchema(f, effective, [], tmp)
    expect(result.argsSchema).not.toBeNull()
    expect(result.argsSchema.options).toHaveLength(1)
    expect(result.argsSchema.options[0].flags).toBe('--db <path>')
  })

  it('returns null argsSchema when argsRepl absent', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export async function inputRepl(input) { return { type: 'done' } }
    `)
    const result = await getReplSchema(f, effective, [], tmp)
    expect(result.argsSchema).toBeNull()
  })

  it('returns commandsSchema from commandsRepl(builder)', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export function commandsRepl(b) {
        return b
          .command('tables', 'List tables')
          .command('schema', 'Show schema', sub => sub.positional('<table>', 'Table name'))
      }
      export async function inputRepl(input) { return { type: 'done' } }
    `)
    const result = await getReplSchema(f, effective, [], tmp)
    expect(result.commandsSchema).not.toBeNull()
    expect(result.commandsSchema.commands).toHaveLength(2)
    expect(result.commandsSchema.commands[0].name).toBe('tables')
    expect(result.commandsSchema.commands[1].name).toBe('schema')
    expect(result.commandsSchema.commands[1].positionals).toHaveLength(1)
  })

  it('returns null commandsSchema when commandsRepl absent', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export function argsRepl(b) { return b.option('--db <path>', 'DB path', './state').build() }
      export async function inputRepl(input) { return { type: 'done' } }
    `)
    const result = await getReplSchema(f, effective, [], tmp)
    expect(result.commandsSchema).toBeNull()
  })

  it('ignores root-level option/positional in commandsRepl builder', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export function commandsRepl(b) {
        // These should be silently ignored
        b.option('--ignored', 'ignored').positional('<also-ignored>', 'ignored')
        return b.command('tables', 'List tables')
      }
      export async function inputRepl(input) { return { type: 'done' } }
    `)
    const result = await getReplSchema(f, effective, [], tmp)
    expect(result.commandsSchema.commands).toHaveLength(1)
    expect(result.commandsSchema.commands[0].name).toBe('tables')
  })

  it('returns both null when neither argsRepl nor commandsRepl exported', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `export async function run() {}`)
    const result = await getReplSchema(f, effective, [], tmp)
    expect(result.argsSchema).toBeNull()
    expect(result.commandsSchema).toBeNull()
  })
})
