import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const dir = mkdtempSync(join(tmpdir(), 'crunes-epipe-'))
mkdirSync(join(dir, '.crunes', 'runes'), { recursive: true })
writeFileSync(join(dir, '.crunes', 'config.json'), JSON.stringify({ runes: { many: { path: '.crunes/runes/many.js' } } }))
writeFileSync(join(dir, '.crunes', 'runes', 'many.js'),
  "import { section } from '@utils'\n" +
  "export async function run() { return Array.from({ length: 5000 }, (_, i) => section.create('s' + i, { type: 'markdown', content: 'line ' + i })) }\n")

describe('crunes run — a reader that closes early', () => {
  it('exits quietly with status 0 instead of crashing on EPIPE', async () => {
    const child = spawn(process.execPath, [join(process.cwd(), 'src', 'cli', 'cli.js'), '-p', '--cwd', dir, 'run', 'many'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', d => { stderr += d })
    // Behave like `| head -1`: take the first chunk, then close the read end.
    child.stdout.once('data', () => child.stdout.destroy())
    const code = await new Promise(resolve => child.on('close', resolve))
    expect(stderr).not.toContain('EPIPE')
    expect(code).toBe(0)
  }, 60_000)
})
