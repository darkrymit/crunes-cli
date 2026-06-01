import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { installDeps } from '../../src/plugin/deps.js'
import { execFile } from 'node:child_process'

vi.mock('node:child_process', () => ({
  execFile: vi.fn((cmd, args, opts, cb) => cb(null, { stdout: '' }))
}))

describe('installDeps — npm fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock pm detection to fallback to npm
    vi.spyOn(fs, 'mkdir').mockResolvedValue()
    vi.spyOn(fs, 'writeFile').mockResolvedValue()
    vi.spyOn(fs, 'rm').mockResolvedValue()
  })

  it('performs npm install with temporary package.json', async () => {
    // Force fallback to npm by having execFile mock return nothing for which commands
    execFile.mockImplementation((cmd, args, opts, cb) => {
      if (cmd === 'where' || cmd === 'which') {
        cb(new Error('not found'), { stdout: '' })
      } else {
        cb(null, { stdout: '' })
      }
    })

    await installDeps('/pluginCache', { 'lodash': '^4.17.21' })

    expect(fs.writeFile).toHaveBeenCalledWith(
      path.join('/pluginCache', 'package.json'),
      expect.stringContaining('"lodash": "^4.17.21"'),
      'utf8'
    )
    expect(execFile).toHaveBeenCalledWith(
      'npm',
      ['install', '--no-audit', '--no-fund', '--omit=dev'],
      expect.objectContaining({ cwd: '/pluginCache' }),
      expect.any(Function)
    )
    expect(fs.rm).toHaveBeenCalledWith(path.join('/pluginCache', 'package.json'), expect.anything())
    expect(fs.rm).toHaveBeenCalledWith(path.join('/pluginCache', 'package-lock.json'), expect.anything())
  })
})
