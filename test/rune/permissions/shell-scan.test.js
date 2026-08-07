import { describe, it, expect } from 'vitest'
import { scanCommand, ScanRefusal } from '../../../src/rune/permissions/shell-scan.js'

const programs = cmd => scanCommand(cmd, 'bash').commands.map(c => c.program)
const segments = cmd => scanCommand(cmd, 'bash').commands.map(c => c.segment)

describe('single commands', () => {
  it('extracts one program from a bare command', () => {
    expect(programs('git status')).toEqual(['git'])
  })

  it('reconstructs the segment as program plus args', () => {
    expect(segments('git log --oneline')).toEqual(['git log --oneline'])
  })

  it('strips quoting when reconstructing the segment', () => {
    expect(segments('git commit -m "hello world"')).toEqual(['git commit -m hello world'])
  })

  it('treats single quotes as fully literal', () => {
    expect(segments("echo 'a $B `c` d'")).toEqual(['echo a $B `c` d'])
  })

  it('ignores leading and repeated whitespace', () => {
    expect(programs('   git    status  ')).toEqual(['git'])
  })

  it('returns no commands for an empty string', () => {
    expect(programs('')).toEqual([])
  })
})

describe('operators create new command positions', () => {
  it('splits on a pipe', () => {
    expect(programs('git log | jq .')).toEqual(['git', 'jq'])
  })

  it('splits on &&', () => {
    expect(programs('npm ci && npm test')).toEqual(['npm', 'npm'])
  })

  it('splits on ||', () => {
    expect(programs('test -f x || touch x')).toEqual(['test', 'touch'])
  })

  it('splits on a semicolon', () => {
    expect(programs('cd src; ls')).toEqual(['cd', 'ls'])
  })

  it('splits on a background ampersand', () => {
    expect(programs('serve & tail log')).toEqual(['serve', 'tail'])
  })

  it('splits on a newline', () => {
    expect(programs('git fetch\ngit merge')).toEqual(['git', 'git'])
  })

  it('does not split on an operator that came from inside quotes', () => {
    expect(programs('echo "a && b"')).toEqual(['echo'])
    expect(programs("grep ';' file")).toEqual(['grep'])
  })
})

describe('environment assignment prefixes', () => {
  it('skips assignments and reports the real program', () => {
    expect(programs('FOO=1 BAR=2 git log')).toEqual(['git'])
  })

  it('excludes the assignments from the reconstructed segment', () => {
    expect(segments('FOO=1 git log')).toEqual(['git log'])
  })

  it('does not treat an assignment-looking argument as a prefix', () => {
    expect(segments('git log --grep=x=y')).toEqual(['git log --grep=x=y'])
  })

  it('refuses a command that is only assignments, since no program runs', () => {
    expect(programs('FOO=1')).toEqual([])
  })
})

describe('offsets', () => {
  it('reports the byte offset of each command position', () => {
    const { commands } = scanCommand('git log | jq .', 'bash')
    expect(commands.map(c => c.offset)).toEqual([0, 10])
  })
})

describe('unterminated quoting', () => {
  it('refuses an unbalanced double quote', () => {
    expect(() => scanCommand('echo "oops', 'bash')).toThrow(ScanRefusal)
  })

  it('refuses an unbalanced single quote', () => {
    expect(() => scanCommand("echo 'oops", 'bash')).toThrow(ScanRefusal)
  })

  it('names the construct and offset on refusal', () => {
    try {
      scanCommand('echo "oops', 'bash')
      throw new Error('should have refused')
    } catch (e) {
      expect(e).toBeInstanceOf(ScanRefusal)
      expect(e.construct).toBe('unterminated double quote')
      expect(e.offset).toBe(5)
    }
  })
})
