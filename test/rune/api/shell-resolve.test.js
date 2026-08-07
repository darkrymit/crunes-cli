import { describe, it, expect, beforeEach } from 'vitest'
import { resolveShell, bashCandidates, resetShellCache, ShellResolutionError } from '../../../src/rune/api/shell-resolve.js'

function win32Deps(present = [], env = {}) {
  const set = new Set(present.map(p => p.toLowerCase()))
  return {
    platform: 'win32',
    env: {
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
      SystemRoot: 'C:\\Windows',
      ComSpec: 'C:\\Windows\\System32\\cmd.exe',
      ...env,
    },
    exists: p => set.has(String(p).toLowerCase()),
    pathDirs: ['C:\\Windows\\System32', 'C:\\tools\\bin'],
  }
}

function posixDeps(present = [], env = {}) {
  const set = new Set(present)
  return {
    platform: 'linux',
    env: { ...env },
    exists: p => set.has(p),
    pathDirs: ['/usr/local/bin', '/usr/bin', '/bin'],
  }
}

beforeEach(() => resetShellCache())

describe('bashCandidates on win32', () => {
  it('lists the three Git install locations in order', () => {
    const c = bashCandidates(win32Deps())
    expect(c.slice(0, 3)).toEqual([
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      'C:\\Users\\me\\AppData\\Local\\Programs\\Git\\bin\\bash.exe',
    ])
  })

  it('never includes a System32 path, because that is the WSL launcher', () => {
    const c = bashCandidates(win32Deps())
    expect(c.some(p => p.toLowerCase().includes('\\windows\\system32\\'))).toBe(false)
  })
})

describe('resolveShell default mode', () => {
  it('prefers bash on win32 when Git Bash is installed', () => {
    const d = win32Deps(['C:\\Program Files\\Git\\bin\\bash.exe'])
    expect(resolveShell(undefined, d)).toEqual({
      kind: 'bash',
      path: 'C:\\Program Files\\Git\\bin\\bash.exe',
    })
  })

  it('falls back to cmd on win32 when no bash exists anywhere', () => {
    const d = win32Deps([])
    expect(resolveShell(undefined, d)).toEqual({ kind: 'cmd', path: 'C:\\Windows\\System32\\cmd.exe' })
  })

  it('refuses to select the WSL launcher even when it is the only bash on PATH', () => {
    const d = win32Deps(['C:\\Windows\\System32\\bash.exe'])
    expect(resolveShell(undefined, d)).toEqual({ kind: 'cmd', path: 'C:\\Windows\\System32\\cmd.exe' })
  })

  it('falls back to sh on POSIX when bash is absent', () => {
    const d = posixDeps(['/bin/sh'])
    expect(resolveShell(undefined, d)).toEqual({ kind: 'sh', path: '/bin/sh' })
  })

  it('prefers bash over sh on POSIX', () => {
    const d = posixDeps(['/bin/bash', '/bin/sh'])
    expect(resolveShell(undefined, d)).toEqual({ kind: 'bash', path: '/bin/bash' })
  })

  it('throws on POSIX when neither bash nor sh exists', () => {
    expect(() => resolveShell(undefined, posixDeps([]))).toThrow(ShellResolutionError)
  })
})

describe('resolveShell explicit mode', () => {
  it('throws for explicit bash when bash is missing, without falling back', () => {
    expect(() => resolveShell('bash', win32Deps([]))).toThrow(/no bash/i)
  })

  it('throws for explicit cmd on POSIX', () => {
    expect(() => resolveShell('cmd', posixDeps(['/bin/bash']))).toThrow(/only available on Windows/i)
  })

  it('resolves explicit cmd on win32', () => {
    expect(resolveShell('cmd', win32Deps())).toEqual({ kind: 'cmd', path: 'C:\\Windows\\System32\\cmd.exe' })
  })

  it('rejects an unknown mode', () => {
    expect(() => resolveShell('fish', posixDeps(['/bin/bash']))).toThrow(/unknown shell mode/i)
  })
})

describe('CRUNES_BASH', () => {
  it('is used only when the probe list finds nothing', () => {
    const d = win32Deps(['C:\\tools\\portable\\bash.exe'], { CRUNES_BASH: 'C:\\tools\\portable\\bash.exe' })
    expect(resolveShell('bash', d)).toEqual({ kind: 'bash', path: 'C:\\tools\\portable\\bash.exe' })
  })

  it('does not override a bash the probe list already found', () => {
    const d = win32Deps(
      ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\tools\\portable\\bash.exe'],
      { CRUNES_BASH: 'C:\\tools\\portable\\bash.exe' },
    )
    expect(resolveShell('bash', d).path).toBe('C:\\Program Files\\Git\\bin\\bash.exe')
  })

  it('is ignored when it points into System32', () => {
    const d = win32Deps(['C:\\Windows\\System32\\bash.exe'], { CRUNES_BASH: 'C:\\Windows\\System32\\bash.exe' })
    expect(() => resolveShell('bash', d)).toThrow(ShellResolutionError)
  })

  it('is ignored when it does not exist', () => {
    const d = win32Deps([], { CRUNES_BASH: 'C:\\nope\\bash.exe' })
    expect(() => resolveShell('bash', d)).toThrow(ShellResolutionError)
  })
})
