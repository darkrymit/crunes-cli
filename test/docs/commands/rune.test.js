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
})
