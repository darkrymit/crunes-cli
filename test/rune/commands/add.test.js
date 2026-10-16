import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { handler } from '../../../src/rune/commands/add.js'
import { output } from '../../../src/shared/output.js'

let dir
const config = () => JSON.parse(readFileSync(join(dir, '.crunes', 'config.json'), 'utf8'))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crunes-add-'))
  mkdirSync(join(dir, '.crunes'))
  mkdirSync(join(dir, 'tools'))
  writeFileSync(join(dir, '.crunes', 'config.json'), '{ "runes": {} }')
  writeFileSync(join(dir, 'tools', 'cov.py'), 'print(1)\n')
  vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
  vi.spyOn(output, 'error').mockImplementation(() => {})
  vi.spyOn(output, 'success').mockImplementation(() => {})
  vi.spyOn(output, 'info').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe('crunes add — registers an existing script or program', () => {
  it('writes the shorthand run block for a script, with its description', async () => {
    await handler({ key: 'cov', command: 'tools/cov.py', description: 'Coverage', configRoot: dir })
    expect(config().runes.cov).toEqual({ description: 'Coverage', run: 'tools/cov.py' })
  })

  it('writes command and argv for a program with fixed arguments', async () => {
    await handler({ key: 'log', command: 'git', argv: ['log', '--oneline'], configRoot: dir })
    expect(config().runes.log).toEqual({ run: { command: 'git', argv: ['log', '--oneline'] } })
  })

  it('refuses a key that already exists', async () => {
    await handler({ key: 'cov', command: 'tools/cov.py', configRoot: dir })
    await expect(handler({ key: 'cov', command: 'git', configRoot: dir })).rejects.toThrow('exit')
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('already exists'))
  })

  it('refuses a file that does not exist', async () => {
    await expect(handler({ key: 'x', command: 'tools/nope.py', configRoot: dir })).rejects.toThrow('exit')
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('does not exist'))
  })
})
