import { describe, it, expect, beforeAll, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
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

describe('runRunBlock — JSON args schemas and validation', () => {
  beforeAll(() => {
    write('tools/env.sh', 'echo "args:${CRUNES_ARGS}"\necho "vars:${CRUNES_VARS}"\n')
    write('tools/env.args.json', JSON.stringify({
      positionals: [{ spec: '<module>', choices: ['auth', 'billing'] }],
      options: [{ flags: '--min <percent>', default: '0' }],
    }))
  })

  it('reads a .json schema file, applying its defaults', async () => {
    const out = await run({ run: 'tools/env.sh', args: 'tools/env.args.json' }, ['auth'])
    const parsed = JSON.parse(out.match(/args:(.*)/)[1])
    expect(parsed.module).toBe('auth')
    expect(parsed.min).toBe('0')
  })

  it('takes a schema written inline', async () => {
    const out = await run({ run: 'tools/env.sh', args: { positionals: [{ spec: '<name>' }] } }, ['x'])
    expect(JSON.parse(out.match(/args:(.*)/)[1]).name).toBe('x')
  })

  it('refuses a call outside the schema before the script starts', async () => {
    await expect(run({ run: 'tools/env.sh', args: 'tools/env.args.json' }, ['payments']))
      .rejects.toThrow('<module> must be one of "auth", "billing"')
    await expect(run({ run: 'tools/env.sh', args: 'tools/env.args.json' }, []))
      .rejects.toThrow('missing required <module>')
  })

  it('shows choices and defaults in --help', async () => {
    const out = await run({ run: 'tools/env.sh', args: 'tools/env.args.json' }, ['--help'])
    expect(out).toContain('[choices: "auth", "billing"]')
    expect(out).toContain('[default: "0"]')
  })

  it('passes the rune\'s vars as CRUNES_VARS, an empty object when there are none', async () => {
    expect(await run({ run: 'tools/env.sh', vars: { threshold: 80 } })).toContain('vars:{"threshold":80}')
    expect(await run({ run: 'tools/env.sh' })).toContain('vars:{}')
  })
})

describe('runRunBlock — structured output', () => {
  const sectionLine = (name, content) =>
    JSON.stringify({ type: 'section', section: { name, data: { type: 'markdown', content } } })

  beforeAll(() => {
    write('tools/sections.sh', [
      'echo "plain one"',
      `echo '${sectionLine('summary', 'S')}'`,
      `echo '${JSON.stringify({ type: 'log', message: 'to stderr' })}'`,
      `echo '${sectionLine('details', 'D')}'`,
      'echo "plain two"',
    ].join('\n') + '\n')
  })

  const entry = { run: { command: 'tools/sections.sh', output: 'sections' } }

  it('captured: turns section lines into sections, emitted as they arrive, and keeps other lines as text', async () => {
    const events = []
    const result = await run(entry, [], { onEvent: e => events.push(e) })
    expect(events.filter(e => e.type === 'section').map(e => e.section.name)).toEqual(['summary', 'details'])
    expect(events[0]).toMatchObject({ type: 'section', rune: 'k', instanceId: '1' })
    // A log line is framed like any rune's: an event, not raw standard error.
    expect(events[1]).toEqual({ type: 'log', level: 'log', message: 'to stderr', rune: 'k', instanceId: '1' })
    expect(result.slice(0, 2).map(s => s.name)).toEqual(['summary', 'details'])
    expect(result[2]).toBe('plain one\nplain two')
  })

  it('direct: prints sections as markdown and plain lines as they are, honouring a section filter', async () => {
    let written = ''
    const write = process.stdout.write
    process.stdout.write = chunk => { written += chunk; return true }
    try {
      expect(await run(entry, [], { direct: true, sections: ['summary'] })).toEqual({ directExitCode: 0 })
    } finally {
      process.stdout.write = write
    }
    expect(written).toContain('plain one\n')
    expect(written).toContain('## summary\nS')
    expect(written).not.toContain('## details')
  })
})

describe('runRunBlock — mapped arguments (pass: "mapped")', () => {
  const entry = {
    run: { command: 'tools/echo.sh', argv: ['log'], pass: 'mapped' },
    args: {
      positionals: [{ spec: '[path]', to: ['--', '{value}'] }],
      options: [{ flags: '--limit <n>', type: 'integer', default: 5, to: '-n{value}' }, { flags: '--graph' }],
    },
  }

  it('rewrites the call into the program\'s arguments, after argv', async () => {
    const out = await run(entry, ['src', '--graph', '--limit', '2'])
    expect(out).toContain('argv:log -n2 --graph -- src')
  })

  it('refuses what the schema does not declare, before the program starts', async () => {
    await expect(run(entry, ['src', 'extra', '--force'])).rejects.toThrow(/unknown option --force\n  unexpected argument "extra"/)
  })

  it('passes the raw arguments unchanged without pass: "mapped"', async () => {
    const out = await run({ run: { command: 'tools/echo.sh', argv: ['log'] }, args: entry.args }, ['src', '--graph'])
    expect(out).toContain('argv:log src --graph')
  })
})

describe('runRunBlock — run.timeout', () => {
  beforeAll(() => { write('tools/slow.sh', 'echo started\nsleep 30\necho never\n') })

  it('captured: stops a script that outlasts its timeout and fails the rune', async () => {
    const started = Date.now()
    await expect(run({ run: { command: 'tools/slow.sh', timeout: 0.5 } })).rejects.toThrow('timed out after 0.5s')
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  it('stops the script before it can run on past a child that was stopped', async () => {
    write('tools/after.sh', `sleep 30\necho ran-on > "${join(dir, 'ran-on.txt')}"\n`)
    await expect(run({ run: { command: 'tools/after.sh', timeout: 0.5 } })).rejects.toThrow('timed out')
    await new Promise(r => setTimeout(r, 300))
    expect(existsSync(join(dir, 'ran-on.txt'))).toBe(false)
  })

  it('direct: ends with status 124, the convention of timeout(1)', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const result = await run({ run: { command: 'tools/slow.sh', timeout: 0.5 } }, [], { direct: true, stdin: 'ignore' })
    expect(result).toEqual({ directExitCode: 124 })
    vi.restoreAllMocks()
  })

  it('leaves a script that finishes in time alone', async () => {
    expect(await run({ run: { command: 'tools/echo.sh', timeout: 10 } }, ['x'])).toContain('argv:x')
  })
})
