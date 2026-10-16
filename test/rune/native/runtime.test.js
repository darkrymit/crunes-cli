import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join, win32 } from 'node:path'
import { tmpdir } from 'node:os'
import { isPathCommand, runtimeOf, findPython, assertNotMissedRename, InterpreterNotFoundError } from '../../../src/rune/native/runtime.js'

describe('isPathCommand — a command is a file when a shell would treat it as one', () => {
  it.each([
    ['tools/x.py', true], ['./x.sh', true], ['../x', true], ['/abs/x', true], ['tools\\x.py', true],
    ['git', false], ['python3', false], ['deploy.sh', false], ['api.rune.js', true],
  ])('%s → %s', (command, expected) => {
    expect(isPathCommand(command)).toBe(expected)
  })
})

describe('runtimeOf — the file name selects the runtime', () => {
  it.each([
    ['.crunes/runes/api.rune.js', 'isolate'],
    ['.crunes/runes/api.rune.mjs', 'isolate'],
    ['tools/types.js', 'node'],
    ['tools/types.mjs', 'node'],
    ['tools/types.cjs', 'node'],
    ['tools/cov.py', 'python'],
    ['tools/check.sh', 'bash'],
    ['tools/report', 'file'],
    ['tools/report.rb', 'file'],
    ['git', 'program'],
  ])('%s → %s', (command, expected) => {
    expect(runtimeOf(command)).toBe(expected)
  })
})

describe('findPython — lookup order', () => {
  const deps = ({ env = {}, existing = [], pathDirs = ['/usr/bin'], platform = 'linux' } = {}) => ({
    platform, env, pathDirs, exists: p => existing.includes(p),
  })

  it('prefers CRUNES_PYTHON over everything else', () => {
    const d = deps({ env: { CRUNES_PYTHON: '/opt/py', VIRTUAL_ENV: '/venv' }, existing: ['/opt/py', '/venv/bin/python', '/proj/.venv/bin/python', '/usr/bin/python3'] })
    expect(findPython('/proj', d)).toEqual({ command: '/opt/py', args: [] })
  })

  it('uses the active virtualenv before the project one', () => {
    const d = deps({ env: { VIRTUAL_ENV: '/venv' }, existing: ['/venv/bin/python', '/proj/.venv/bin/python'] })
    expect(findPython('/proj', d).command).toBe('/venv/bin/python')
  })

  it('finds a project .venv without being told, then venv/', () => {
    expect(findPython('/proj', deps({ existing: ['/proj/.venv/bin/python', '/usr/bin/python3'] })).command).toBe('/proj/.venv/bin/python')
    expect(findPython('/proj', deps({ existing: ['/proj/venv/bin/python', '/usr/bin/python3'] })).command).toBe('/proj/venv/bin/python')
  })

  it('falls back to python3, then python, on PATH', () => {
    expect(findPython('/proj', deps({ existing: ['/usr/bin/python3', '/usr/bin/python'] })).command).toBe('/usr/bin/python3')
    expect(findPython('/proj', deps({ existing: ['/usr/bin/python'] })).command).toBe('/usr/bin/python')
  })

  it('uses Scripts\\python.exe for a Windows virtualenv and py -3 as the last resort', () => {
    const win = deps({ platform: 'win32', pathDirs: ['C:\\Win'], existing: [win32.join('C:\\Win', 'py.exe')] })
    expect(findPython('C:\\proj', win)).toEqual({ command: win32.join('C:\\Win', 'py.exe'), args: ['-3'] })
    const venv = deps({ platform: 'win32', env: { VIRTUAL_ENV: 'C:\\v' }, existing: [win32.join('C:\\v', 'Scripts', 'python.exe')] })
    expect(findPython('C:\\proj', venv).command).toBe(win32.join('C:\\v', 'Scripts', 'python.exe'))
  })

  it('names every candidate it tried when nothing is found', () => {
    let err
    try { findPython('/proj', deps()) } catch (e) { err = e }
    expect(err).toBeInstanceOf(InterpreterNotFoundError)
    expect(err.message).toContain('CRUNES_PYTHON: (unset)')
    expect(err.message).toContain('/proj/.venv/bin/python')
    expect(err.message).toContain('python3: (not on PATH)')
    expect(err.message).toContain('set CRUNES_PYTHON')
  })
})

describe('assertNotMissedRename — a plain .js handler importing @utils is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crunes-rename-'))
  const file = (name, body) => { const p = join(dir, name); writeFileSync(p, body); return p }

  it('refuses a static @utils import, naming the rename', () => {
    const f = file('a.js', "import { fs } from '@utils'\n")
    expect(() => assertNotMissedRename(f, 'node', dir)).toThrow('mv a.js a.rune.js')
  })

  it('refuses a side-effect and a dynamic @utils import', () => {
    expect(() => assertNotMissedRename(file('b.mjs', "import '@utils'\n"), 'node', dir)).toThrow('b.rune.mjs')
    expect(() => assertNotMissedRename(file('c.js', "await import('@utils')\n"), 'node', dir)).toThrow()
  })

  it('lets an ordinary Node script through', () => {
    expect(() => assertNotMissedRename(file('d.js', "import fs from 'node:fs'\n// mentions @utils in a comment\n"), 'node', dir)).not.toThrow()
  })

  it('only applies to the node runtime', () => {
    expect(() => assertNotMissedRename(file('e.py', "from '@utils'\n"), 'python', dir)).not.toThrow()
  })
})
