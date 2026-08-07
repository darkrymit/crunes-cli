import { describe, it, expect } from 'vitest'
import { createOsInfo } from '../../../src/rune/api/os.js'

describe('createOsInfo', () => {
  it('reports the five non-identifying fields', () => {
    const os = createOsInfo()
    expect(Object.keys(os).sort()).toEqual(['arch', 'eol', 'pathSep', 'platform', 'shell'])
  })

  it('matches the host platform and arch', () => {
    const os = createOsInfo()
    expect(os.platform).toBe(process.platform)
    expect(os.arch).toBe(process.arch)
  })

  it('reports a resolvable shell kind', () => {
    expect(['bash', 'sh', 'cmd']).toContain(createOsInfo().shell)
  })

  it('uses platform-correct separators', () => {
    const os = createOsInfo()
    expect(os.pathSep).toBe(process.platform === 'win32' ? '\\' : '/')
    expect(os.eol).toBe(process.platform === 'win32' ? '\r\n' : '\n')
  })

  it('exposes no identifying fields', () => {
    const os = createOsInfo()
    for (const banned of ['tmpdir', 'homedir', 'hostname', 'username', 'cpus', 'totalmem', 'release']) {
      expect(os).not.toHaveProperty(banned)
    }
  })

  it('is JSON-serialisable, since it crosses the isolate boundary as a string', () => {
    expect(() => JSON.parse(JSON.stringify(createOsInfo()))).not.toThrow()
  })
})
