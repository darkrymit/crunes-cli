import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checkRunBlockRunes } from '../../../src/cli/commands/doctor.js'

const dir = mkdtempSync(join(tmpdir(), 'crunes-doctor-run-'))
mkdirSync(join(dir, 'tools'), { recursive: true })
writeFileSync(join(dir, 'tools', 'ok.sh'), 'echo ok\n')
writeFileSync(join(dir, 'tools', 'renamed.js'), "import { fs } from '@utils'\n")

const check = runes => checkRunBlockRunes({ runes }, dir)

describe('checkRunBlockRunes — doctor reports what runs each run-block rune', () => {
  it('names the interpreter for a script and marks it native', () => {
    const [r] = check({ ok: { run: 'tools/ok.sh' } })
    expect(r.ok).toBe(true)
    expect(r.message).toMatch(/^ok → bash: .*bash(\.exe)? \(native\)$/i)
  })

  it('reports an isolate module as such', () => {
    expect(check({ api: { run: 'api.rune.js' } })[0]).toEqual({ ok: true, message: 'api → isolate' })
  })

  it('fails a missing file, a program not on PATH, and a missed rename', () => {
    const results = check({
      gone: { run: 'tools/gone.py' },
      nope: { run: 'no-such-program-for-crunes' },
      renamed: { run: 'tools/renamed.js' },
    })
    expect(results.map(r => r.ok)).toEqual([false, false, false])
    expect(results[0].message).toContain('tools/gone.py does not exist')
    expect(results[1].message).toContain('is not on PATH')
    expect(results[2].message).toContain('mv tools/renamed.js tools/renamed.rune.js')
  })

  it('ignores path runes', () => {
    expect(check({ old: { path: 'runes/old.js' } })).toEqual([])
  })
})
