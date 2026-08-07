import { describe, it, expect } from 'vitest'
import { createShellUtils } from '../../../src/rune/api/shell.js'

const shell = createShellUtils(process.cwd(), null)

describe('shell.exec stdin', () => {
  it('writes a string stdin and closes it so the child sees EOF', async () => {
    const res = await shell.exec('cat', { stdin: 'hello\n', timeout: 5000 })
    expect(res.stdout).toBe('hello')
    expect(res.exitCode).toBe(0)
  })

  it('closes stdin when none is supplied, so EOF readers do not hang', async () => {
    const res = await shell.exec('cat', { timeout: 5000 })
    expect(res.stdout).toBe('')
    expect(res.exitCode).toBe(0)
  })

  it('decodes the marshalled Buffer shape the isolate sends for Uint8Array stdin', async () => {
    const res = await shell.exec('cat', {
      stdin: { type: 'Buffer', data: Array.from(Buffer.from('bin\n')) },
      timeout: 5000,
    })
    expect(res.stdout).toBe('bin')
  })

  it('accepts a real Uint8Array stdin', async () => {
    const res = await shell.exec('cat', {
      stdin: new Uint8Array(Buffer.from('u8\n')),
      timeout: 5000,
    })
    expect(res.stdout).toBe('u8')
  })
})

describe('shell.exec timeout', () => {
  it('rejects with a timeout error rather than hanging', async () => {
    // `sleep 30` outlives the timeout; the point is that we reject at ~500ms.
    const started = Date.now()
    await expect(shell.exec('sleep 30', { timeout: 500 })).rejects.toThrow(/timed out after 500ms/)
    expect(Date.now() - started).toBeLessThan(5000)
  })
})
