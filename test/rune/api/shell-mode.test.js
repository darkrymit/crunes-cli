import { describe, it, expect } from 'vitest'
import { createShellUtils } from '../../../src/rune/api/shell.js'

const shell = createShellUtils(process.cwd(), null)

describe('opts.shell', () => {
  it('runs POSIX syntax under the default shell on every platform', async () => {
    const res = await shell.exec('echo one && echo two', { timeout: 5000 })
    expect(res.stdout).toBe('one\ntwo')
  })

  it('reports the resolved shell kind', () => {
    expect(['bash', 'sh', 'cmd']).toContain(shell.resolvedShellKind())
  })

  it('throws a helpful error for cmd on non-Windows', async () => {
    if (process.platform === 'win32') return
    await expect(shell.exec('echo hi', { shell: 'cmd', timeout: 5000 }))
      .rejects.toThrow(/only available on Windows/i)
  })

  it('rejects an unknown shell mode', async () => {
    await expect(shell.exec('echo hi', { shell: 'fish', timeout: 5000 }))
      .rejects.toThrow(/unknown shell mode/i)
  })
})
