import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { handler } from '../../../src/docs/commands/utils.js'

describe('help utils handler', () => {
  let written
  let exitSpy

  beforeEach(() => {
    written = []
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { written.push(chunk); return true })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit') })
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('no namespaces renders index with all namespaces', async () => {
    await handler({ namespaces: [] })
    const out = written.join('')
    expect(out).toContain('Available utils namespaces')
    expect(out).toContain('ws')
    expect(out).toContain('fs')
  })

  it('known namespace renders its header', async () => {
    await handler({ namespaces: ['ws'] })
    expect(written.join('')).toContain('ws')
  })

  it('multiple namespaces renders both headers', async () => {
    await handler({ namespaces: ['ws', 'fs'] })
    const out = written.join('')
    expect(out).toContain('ws')
    expect(out).toContain('fs')
  })

  it('json format emits valid JSON array', async () => {
    await handler({ namespaces: ['ws'], format: 'json' })
    const parsed = JSON.parse(written.join(''))
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].kind).toBe('namespace')
    expect(parsed[0].name).toBe('ws')
    expect(Array.isArray(parsed[0].members)).toBe(true)
  })

  it('json with no namespaces returns all', async () => {
    await handler({ namespaces: [], format: 'json' })
    const parsed = JSON.parse(written.join(''))
    expect(parsed.length).toBeGreaterThanOrEqual(15)
  })

  it('unknown namespace exits 1', async () => {
    await expect(handler({ namespaces: ['nonexistent'] })).rejects.toThrow('process.exit')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
