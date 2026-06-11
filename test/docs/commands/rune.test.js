import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { handler } from '../../../src/docs/commands/rune.js'

describe('help rune handler', () => {
  let tmp
  let written

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'crunes-help-'))
    await mkdir(join(tmp, '.crunes', 'runes'), { recursive: true })
    await writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify({
      runes: {
        greet: { name: 'Greeter', description: 'Says hello' },
        count: { name: 'Counter', description: 'Counts things' },
      }
    }))
    await writeFile(join(tmp, '.crunes', 'runes', 'greet.js'), [
      'export async function args(b) {',
      '  return b.positional("<who>", "Who to greet").build()',
      '}',
      'export async function run() { return [] }',
    ].join('\n'))
    await writeFile(join(tmp, '.crunes', 'runes', 'count.js'), [
      'export async function run() { return [] }',
    ].join('\n'))
    written = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { written.push(chunk); return true })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(tmp, { recursive: true, force: true })
  })

  it('md output contains usage line and rune description', async () => {
    await handler({ keys: ['greet'], projectRoot: tmp, configRoot: tmp })
    const out = written.join('')
    expect(out).toContain('crunes run greet')
    expect(out).toContain('Says hello')
  })

  it('md output for multiple keys contains both usage lines', async () => {
    await handler({ keys: ['greet', 'count'], projectRoot: tmp, configRoot: tmp })
    const out = written.join('')
    expect(out).toContain('crunes run greet')
    expect(out).toContain('crunes run count')
  })

  it('json output is valid JSON array with correct shape', async () => {
    await handler({ keys: ['greet'], format: 'json', projectRoot: tmp, configRoot: tmp })
    const out = written.join('')
    const parsed = JSON.parse(out)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({
      key: 'greet',
      name: 'Greeter',
      description: 'Says hello',
      schema: { positionals: [{ spec: '<who>' }], options: [], examples: [] },
    })
  })

  it('json output for multiple keys has one entry per key', async () => {
    await handler({ keys: ['greet', 'count'], format: 'json', projectRoot: tmp, configRoot: tmp })
    const out = written.join('')
    const parsed = JSON.parse(out)
    expect(parsed).toHaveLength(2)
    expect(parsed.map(r => r.key)).toEqual(['greet', 'count'])
  })

  it('rune with no args() export has null schema in json', async () => {
    await handler({ keys: ['count'], format: 'json', projectRoot: tmp, configRoot: tmp })
    const out = written.join('')
    const parsed = JSON.parse(out)
    expect(parsed[0].schema).toBeNull()
  })

  it('unknown key in batch is skipped but exit 1 is called', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    await handler({ keys: ['greet', 'unknown'], format: 'json', projectRoot: tmp, configRoot: tmp })
    const out = written.join('')
    const parsed = JSON.parse(out)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].key).toBe('greet')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('unknown key suggesting commands displays correct Tip', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await handler({ keys: ['run'], projectRoot: tmp, configRoot: tmp })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown rune: "run". (Tip: Did you mean "crunes docs run"?)'))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  describe('batch field in docs output', () => {
    beforeEach(async () => {
      const cfg = JSON.parse(await import('node:fs').then(m => m.promises.readFile(join(tmp, '.crunes', 'config.json'), 'utf8')))
      cfg.runes.greet.batch = { allow: ['*'] }
      await import('node:fs').then(m => m.promises.writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify(cfg)))
    })

    it('text output includes Batch: section when batch block declared', async () => {
      await handler({ keys: ['greet'], projectRoot: tmp, configRoot: tmp })
      const out = written.join('')
      expect(out).toContain('Batch:')
      expect(out).toContain('allow: *')
    })

    it('text output shows not permitted when no batch block', async () => {
      await handler({ keys: ['count'], projectRoot: tmp, configRoot: tmp })
      const out = written.join('')
      expect(out).toContain('Batch:')
      expect(out).toContain('not permitted')
    })

    it('json output includes batch field with allow/deny arrays', async () => {
      await handler({ keys: ['greet'], format: 'json', projectRoot: tmp, configRoot: tmp })
      const parsed = JSON.parse(written.join(''))
      expect(parsed[0].batch).toEqual({ allow: ['*'], deny: [] })
    })

    it('json output batch is null when no batch block declared', async () => {
      await handler({ keys: ['count'], format: 'json', projectRoot: tmp, configRoot: tmp })
      const parsed = JSON.parse(written.join(''))
      expect(parsed[0].batch).toBeNull()
    })
  })

  // REPL schema extension tests
  describe('REPL schema display', () => {
    beforeEach(async () => {
      await writeFile(join(tmp, '.crunes', 'runes', 'shell.js'), [
        'export async function argsRepl(b) {',
        '  return b.option("--db <path>", "DB path", "./state").build()',
        '}',
        'export function commandsRepl(b) {',
        '  return b.command("tables", "List tables").command("exit", "Quit")',
        '}',
        'export async function inputRepl(input) { return { type: "done" } }',
      ].join('\n'))
      const cfg = JSON.parse(await import('node:fs').then(m => m.promises.readFile(join(tmp, '.crunes', 'config.json'), 'utf8')))
      cfg.runes.shell = { name: 'Shell', description: 'Interactive shell' }
      await import('node:fs').then(m => m.promises.writeFile(join(tmp, '.crunes', 'config.json'), JSON.stringify(cfg)))
    })

    it('text output includes REPL args section when argsRepl exported', async () => {
      await handler({ keys: ['shell'], projectRoot: tmp, configRoot: tmp })
      const out = written.join('')
      expect(out).toContain('crunes run-repl shell')
      expect(out).toContain('--db <path>')
    })

    it('text output includes slash commands section when commandsRepl exported', async () => {
      await handler({ keys: ['shell'], projectRoot: tmp, configRoot: tmp })
      const out = written.join('')
      expect(out).toContain('/tables')
      expect(out).toContain('List tables')
      expect(out).toContain('/exit')
    })

    it('json output includes repl field with argsSchema and commandsSchema', async () => {
      await handler({ keys: ['shell'], format: 'json', projectRoot: tmp, configRoot: tmp })
      const out = written.join('')
      const parsed = JSON.parse(out)
      expect(parsed[0].repl).not.toBeNull()
      expect(parsed[0].repl.argsSchema.options[0].flags).toBe('--db <path>')
      expect(parsed[0].repl.commandsSchema.commands).toHaveLength(2)
    })

    it('json output repl is null for rune with no REPL exports', async () => {
      await handler({ keys: ['count'], format: 'json', projectRoot: tmp, configRoot: tmp })
      const out = written.join('')
      const parsed = JSON.parse(out)
      expect(parsed[0].repl).toBeNull()
    })
  })
})
