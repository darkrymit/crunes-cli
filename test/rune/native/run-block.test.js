import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runRunBlock } from '../../../src/rune/native/run-block.js'

// A real project: script runes spawn real processes, and the schema cache wants a .crunes/.
const dir = mkdtempSync(join(tmpdir(), 'crunes-run-block-'))
const write = (rel, body) => {
  const p = join(dir, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, body)
  return rel
}

beforeAll(() => {
  write('.crunes/config.json', '{}')
  write('tools/echo.sh', 'echo "argv:$*"\necho "key:$CRUNES_RUNE_KEY lifecycle:$CRUNES_LIFECYCLE root:$CRUNES_PROJECT_ROOT"\necho "args:${CRUNES_ARGS:-none}"\n')
  write('tools/fail.sh', 'echo partial\nexit 7\n')
  write('tools/quiet.sh', 'exit 3\n')
  write('tools/killed.sh', 'kill -TERM $$\n')
  write('tools/stdin.sh', 'cat; echo "eof"\n')
  write('tools/hello.mjs', 'console.log("node", process.argv.slice(2).join(" "))\n')
  write('.crunes/runes/echo.args.rune.js',
    "export async function args(b) { return b.positional('<module>', 'Module to report on').option('--min <percent>', 'Minimum', '0') }\n")
  write('.crunes/runes/iso.rune.js',
    "import { section } from '@utils'\nexport async function run(a) { return section.create('iso', { type: 'markdown', content: a._.join(',') }) }\n")
})

const run = (entry, args = [], opts = {}) =>
  runRunBlock({ dir, key: 'k', args, entry, opts, configDir: dir, runeCallback: null, instanceId: '1' })

describe('runRunBlock — captured (framed invocations)', () => {
  it('returns standard output as the result, with argv before the caller\'s arguments', async () => {
    const out = await run({ run: { command: 'tools/echo.sh', argv: ['--fixed'] } }, ['a', 'b'])
    expect(out).toContain('argv:--fixed a b')
    expect(out.endsWith('\n')).toBe(false)
  })

  it('sets the CRUNES_ variables and runs from the project root', async () => {
    const out = await run({ run: 'tools/echo.sh' })
    expect(out).toContain(`key:k lifecycle:run root:${dir}`)
    expect(out).toContain('args:none')
  })

  it('runs Node scripts with the Node crunes runs on', async () => {
    expect(await run({ run: 'tools/hello.mjs' }, ['x'])).toBe('node x')
  })

  it('fails the rune on a non-zero exit, naming the status', async () => {
    await expect(run({ run: 'tools/fail.sh' })).rejects.toThrow('exited with status 7')
  })

  it('closes standard input when asked, as a batch does', async () => {
    expect(await run({ run: 'tools/stdin.sh' }, [], { stdin: 'ignore' })).toBe('eof')
  })

  it('reports a program that is not on PATH', async () => {
    await expect(run({ run: 'no-such-program-for-crunes' })).rejects.toThrow('not found')
  })
})

describe('runRunBlock — direct (a single invocation)', () => {
  it('passes the script\'s own exit code through', async () => {
    expect(await run({ run: 'tools/quiet.sh' }, [], { direct: true })).toEqual({ directExitCode: 3 })
  })

  // Signals are POSIX; Windows has no equivalent of a process killing itself with SIGTERM.
  it.skipIf(process.platform === 'win32')('reports a signal-killed script as 128 + the signal number', async () => {
    expect(await run({ run: 'tools/killed.sh' }, [], { direct: true })).toEqual({ directExitCode: 143 })
  })

  it('refuses a section filter, because nothing is captured to filter', async () => {
    await expect(run({ run: 'tools/quiet.sh' }, [], { direct: true, sections: ['output'] }))
      .rejects.toThrow('section filter cannot apply')
  })
})

describe('runRunBlock — an args module in front of a script', () => {
  const entry = { run: 'tools/echo.sh', args: '.crunes/runes/echo.args.rune.js' }

  it('parses the call and passes the result as CRUNES_ARGS, with the raw arguments unchanged', async () => {
    const out = await run(entry, ['auth', '--min', '80'])
    expect(out).toContain('argv:auth --min 80')
    const parsed = JSON.parse(out.match(/args:(.*)/)[1])
    expect(parsed.module).toBe('auth')
    expect(parsed.min).toBe('80')
  })

  it('answers --help itself, without spawning the script', async () => {
    const out = await run(entry, ['--help'])
    expect(out).toContain('Usage: crunes run k <module>')
    expect(out).not.toContain('argv:')
  })
})

describe('runRunBlock — an isolate module', () => {
  it('runs in the isolate exactly as a path rune does, with argv first', async () => {
    const result = await run({ run: { command: '.crunes/runes/iso.rune.js', argv: ['fixed'] } }, ['x'])
    expect(result.name).toBe('iso')
    expect(result.data.content).toBe('fixed,x')
  })
})
