import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

// vitest keeps its own event loop busy, so the bug only shows in a fresh process:
// there, nothing but the rune's own timer can keep Node alive while run() awaits it.
const runner = pathToFileURL(join(process.cwd(), 'src', 'rune', 'isolation', 'runner.js')).href
const dir = mkdtempSync(join(tmpdir(), 'crunes-timer-'))

const runInFreshProcess = runeSource => {
  const runeFile = join(dir, `r${Math.random().toString(36).slice(2)}.js`)
  writeFileSync(runeFile, runeSource)
  const script = `
    const { runRuneInIsolate } = await import(${JSON.stringify(runner)})
    const result = await runRuneInIsolate(${JSON.stringify(runeFile)}, { allow: [], deny: [] }, [], ${JSON.stringify(dir)})
    console.log('RESULT ' + JSON.stringify(result))
  `
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30_000 })
}

describe('isolate timers — the process stays alive while run() awaits one', () => {
  it('resumes run() after an awaited setTimeout instead of exiting silently', () => {
    const out = runInFreshProcess(
      "export async function run() { await new Promise(r => setTimeout(r, 200)); return 'woke up' }\n"
    )
    expect(out.stdout).toContain('RESULT "woke up"')
  }, 40_000)

  it('still lets the process exit when a timer is left pending after run() returns', () => {
    const started = Date.now()
    const out = runInFreshProcess(
      "export async function run() { setTimeout(() => {}, 60_000); return 'returned' }\n"
    )
    expect(out.stdout).toContain('RESULT "returned"')
    expect(Date.now() - started).toBeLessThan(20_000)
  }, 40_000)
})
