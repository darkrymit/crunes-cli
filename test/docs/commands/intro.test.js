import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { handler } from '../../../src/docs/commands/intro.js'
import { writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

describe('help intro command handler', () => {
  let written
  let outFilePath

  beforeEach(() => {
    written = []
    outFilePath = join(process.cwd(), 'test-crunes-intro.md')
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { written.push(chunk); return true })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (existsSync(outFilePath)) {
      rmSync(outFilePath)
    }
  })

  it('prints compiled intro to stdout by default', async () => {
    await handler({})
    const out = written.join('')
    expect(out).toContain('# Crunes: Fast Sandboxed Scripting & Context Framework')
  })

  it('writes output to a file if out parameter is passed', async () => {
    await handler({ out: 'test-crunes-intro.md' })
    expect(existsSync(outFilePath)).toBe(true)
  })
})
