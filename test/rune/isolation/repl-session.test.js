import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { runRuneInReplSession } from '../../../src/rune/isolation/runner.js'

describe('runRuneInReplSession — new session object', () => {
  let tmp

  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'crunes-repl-')) })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  const effective = { allow: [], deny: [] }

  it('initialPrompt from runRepl(args)', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export async function runRepl(args) { return 'custom> ' }
      export async function inputRepl(input) { return { type: 'done' } }
    `)
    const session = await runRuneInReplSession(f, effective, [], tmp)
    expect(session.initialPrompt).toBe('custom> ')
    await session.dispose()
  })

  it('initialPrompt is null when runRepl absent', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export async function inputRepl(input) { return { type: 'done' } }
    `)
    const session = await runRuneInReplSession(f, effective, [], tmp)
    expect(session.initialPrompt).toBeNull()
    await session.dispose()
  })

  it('banner from bannerRepl(args)', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export async function runRepl(args) {}
      export function bannerRepl(args) { return 'Welcome!' }
      export async function inputRepl(input) { return { type: 'done' } }
    `)
    const session = await runRuneInReplSession(f, effective, [], tmp)
    expect(session.banner).toBe('Welcome!')
    await session.dispose()
  })

  it('banner is null when bannerRepl absent', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export async function runRepl(args) {}
      export async function inputRepl(input) { return { type: 'done' } }
    `)
    const session = await runRuneInReplSession(f, effective, [], tmp)
    expect(session.banner).toBeNull()
    await session.dispose()
  })

  it('commandsSchema from commandsRepl(builder)', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export async function runRepl(args) {}
      export function commandsRepl(b) {
        return b.command('tables', 'List tables').command('exit', 'Quit')
      }
      export async function inputRepl(input) { return { type: 'done' } }
    `)
    const session = await runRuneInReplSession(f, effective, [], tmp)
    expect(session.commandsSchema).not.toBeNull()
    expect(session.commandsSchema.commands).toHaveLength(2)
    expect(session.commandsSchema.commands[0].name).toBe('tables')
    await session.dispose()
  })

  it('commandsSchema is null when commandsRepl absent', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export async function runRepl(args) {}
      export async function inputRepl(input) { return { type: 'done' } }
    `)
    const session = await runRuneInReplSession(f, effective, [], tmp)
    expect(session.commandsSchema).toBeNull()
    await session.dispose()
  })

  it('step() calls inputRepl with InputEvent object', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export async function runRepl(args) {}
      export async function inputRepl(input) {
        if (input.type === 'line' && input.text === 'hello') return 'got-it> '
        return { type: 'done' }
      }
    `)
    const session = await runRuneInReplSession(f, effective, [], tmp)
    const result = await session.step({ type: 'line', text: 'hello' })
    expect(result).toBe('got-it> ')
    await session.dispose()
  })

  it('step() passes interrupt event to inputRepl', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export async function runRepl(args) {}
      export async function inputRepl(input) {
        if (input.type === 'interrupt') return { type: 'done', message: 'interrupted' }
        return undefined
      }
    `)
    const session = await runRuneInReplSession(f, effective, [], tmp)
    const result = await session.step({ type: 'interrupt', text: '' })
    expect(result).toMatchObject({ type: 'done', message: 'interrupted' })
    await session.dispose()
  })

  it('complete() calls completeInputRepl with tokens', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export async function runRepl(args) {}
      export async function inputRepl(input) { return { type: 'done' } }
      export async function completeInputRepl(tokens) {
        const partial = tokens[tokens.length - 1] ?? ''
        return ['SELECT', 'FROM', 'WHERE'].filter(k => k.startsWith(partial.toUpperCase()))
      }
    `)
    const session = await runRuneInReplSession(f, effective, [], tmp)
    expect(session.complete).not.toBeNull()
    const completions = await session.complete(['SE'])
    expect(completions).toEqual(['SELECT'])
    await session.dispose()
  })

  it('complete is null when completeInputRepl absent', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export async function runRepl(args) {}
      export async function inputRepl(input) { return { type: 'done' } }
    `)
    const session = await runRuneInReplSession(f, effective, [], tmp)
    expect(session.complete).toBeNull()
    await session.dispose()
  })

  it('throws if neither runRepl nor inputRepl exported', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `export async function run() {}`)
    await expect(runRuneInReplSession(f, effective, [], tmp)).rejects.toThrow()
  })

  it('calls disposeRepl() when session.dispose() is called', async () => {
    const f = join(tmp, 'rune.js')
    const flag = join(tmp, 'disposed.txt')
    await writeFile(f, `
      import { fs } from '@utils'
      export async function runRepl(args) { return '> ' }
      export async function inputRepl(input) { return { type: 'done' } }
      export async function disposeRepl() { await fs.write('disposed.txt', 'yes') }
    `)
    const session = await runRuneInReplSession(f, { allow: ['fs.write:./*'], deny: [] }, [], tmp)
    await session.dispose()
    const { readFile } = await import('node:fs/promises')
    expect(await readFile(flag, 'utf8')).toBe('yes')
  })

  it('swallows errors thrown by disposeRepl()', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export async function runRepl(args) { return '> ' }
      export async function inputRepl(input) { return { type: 'done' } }
      export async function disposeRepl() { throw new Error('cleanup failed') }
    `)
    const session = await runRuneInReplSession(f, effective, [], tmp)
    await expect(session.dispose()).resolves.toBeUndefined()
  })

  it('does not require disposeRepl() export', async () => {
    const f = join(tmp, 'rune.js')
    await writeFile(f, `
      export async function runRepl(args) { return '> ' }
      export async function inputRepl(input) { return { type: 'done' } }
    `)
    const session = await runRuneInReplSession(f, effective, [], tmp)
    await expect(session.dispose()).resolves.toBeUndefined()
  })
})
