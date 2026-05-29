import { describe, it, expect } from 'vitest'
import {
  computeEffectivePermissions,
  makePermissionChecker,
  PermissionError,
} from '../../../src/rune/permissions/permissions.js'

describe('computeEffectivePermissions', () => {
  it('uses plugin allow when no project override', () => {
    const result = computeEffectivePermissions({ use: { allow: ['fs.read:**'] } }, undefined, 'use')
    expect(result.allow).toEqual(['fs.read:./**'])
  })

  it('project allow fully replaces plugin allow', () => {
    const result = computeEffectivePermissions(
      { use: { allow: ['fs.read:**'] } },
      { use: { allow: ['fs.read:src/**'] } },
      'use'
    )
    expect(result.allow).toEqual(['fs.read:./src/**'])
  })

  it('merges plugin deny and project deny', () => {
    const result = computeEffectivePermissions(
      { use: { allow: [], deny: ['shell:**'] } },
      { use: { deny: ['fs.read:/etc/**'] } },
      'use'
    )
    expect(result.deny).toContain('shell:**')
    expect(result.deny).toContain('fs.read:/etc/**')
  })

  it('handles missing allow/deny gracefully', () => {
    const result = computeEffectivePermissions({}, undefined, 'use')
    expect(result.allow).toEqual([])
    expect(result.deny).toEqual([])
  })

  it('project deny adds to plugin deny even when project allow is set', () => {
    const result = computeEffectivePermissions(
      { use: { allow: ['fs.read:**'], deny: ['shell:**'] } },
      { use: { allow: ['fs.read:**'], deny: ['fs.write:**'] } },
      'use'
    )
    expect(result.deny).toContain('shell:**')
    expect(result.deny).toContain('fs.write:./**')
  })

  it('normalizes fs.read and fs.glob relative paths to use ./ prefix', () => {
    const result = computeEffectivePermissions(
      { use: { allow: ['fs.read:package.json'] } },
      { use: { allow: ['fs.glob:src/*.js'] } },
      'use'
    )
    expect(result.allow).toEqual(['fs.glob:./src/*.js'])

    const result2 = computeEffectivePermissions(
      { use: { allow: ['fs.read:package.json'] } },
      undefined,
      'use'
    )
    expect(result2.allow).toEqual(['fs.read:./package.json'])
  })

  it('normalizes fs.write relative paths to use ./ prefix', () => {
    const result = computeEffectivePermissions(
      { use: { allow: ['fs.write:src/*.js'] } },
      undefined,
      'use'
    )
    expect(result.allow).toEqual(['fs.write:./src/*.js'])
  })
})

describe('makePermissionChecker', () => {
  it('passes when token matches allow glob', () => {
    const check = makePermissionChecker({ allow: ['fs.read:package.json'], deny: [] })
    expect(() => check('fs.read', 'package.json')).not.toThrow()
  })

  it('throws PermissionError when token is not in allow', () => {
    const check = makePermissionChecker({ allow: ['fs.read:src/**'], deny: [] })
    expect(() => check('shell', 'ls')).toThrow(PermissionError)
  })

  it('throws PermissionError when token is in deny even if in allow', () => {
    const check = makePermissionChecker({ allow: ['fs.read:**'], deny: ['fs.read:/etc/**'] })
    expect(() => check('fs.read', '/etc/passwd')).toThrow(PermissionError)
  })

  it('PermissionError carries capability, value, and message', () => {
    const check = makePermissionChecker({ allow: [], deny: [] })
    let err
    try { check('shell', 'rm -rf') } catch (e) { err = e }
    expect(err).toBeInstanceOf(PermissionError)
    expect(err.capability).toBe('shell')
    expect(err.value).toBe('rm -rf')
    expect(err.message).toContain("'shell:rm -rf' is not permitted.")
  })

  it('wildcard allow passes any matching path', () => {
    const check = makePermissionChecker({ allow: ['fs.read:*'], deny: [] })
    expect(() => check('fs.read', 'package.json')).not.toThrow()
    expect(() => check('fs.read', 'tsconfig.json')).not.toThrow()
  })
})

describe('normalizePermission — virtual root tokens', () => {
  it('sqlite.read:@project-sqlite/data/mydb preserved as-is', () => {
    const result = computeEffectivePermissions(
      { use: { allow: ['sqlite.read:@project-sqlite/data/mydb'] } },
      undefined, 'use'
    )
    expect(result.allow).toEqual(['sqlite.read:@project-sqlite/data/mydb'])
  })

  it('sqlite.read:@project-sqlite/** preserved as-is', () => {
    const result = computeEffectivePermissions(
      { use: { allow: ['sqlite.read:@project-sqlite/**'] } },
      undefined, 'use'
    )
    expect(result.allow).toEqual(['sqlite.read:@project-sqlite/**'])
  })

  it('cache.read:@plugin-cache/** preserved as-is', () => {
    const result = computeEffectivePermissions(
      { use: { allow: ['cache.read:@plugin-cache/**'] } },
      undefined, 'use'
    )
    expect(result.allow).toEqual(['cache.read:@plugin-cache/**'])
  })

  it('fs.read:@plugin-sqlite/** not mangled with ./ prefix', () => {
    const result = computeEffectivePermissions(
      { use: { allow: ['fs.read:@plugin-sqlite/**'] } },
      undefined, 'use'
    )
    expect(result.allow).toEqual(['fs.read:@plugin-sqlite/**'])
  })

  it('sqlite.read with regular path still normalizes :name', () => {
    const result = computeEffectivePermissions(
      { use: { allow: ['sqlite.read:mydb:default'] } },
      undefined, 'use'
    )
    expect(result.allow).toEqual(['sqlite.read:./mydb:default'])
  })

  it('@project-sqlite/** permission matches subpath token', () => {
    const check = makePermissionChecker({
      allow: ['sqlite.read:@project-sqlite/**'],
      deny: [],
    })
    expect(() => check('sqlite.read', '@project-sqlite/data:mydb')).not.toThrow()
    expect(() => check('sqlite.read', '@project-sqlite/a/b:mydb')).not.toThrow()
  })

  it('@project-sqlite/** permission matches root-level token', () => {
    const check = makePermissionChecker({
      allow: ['sqlite.read:@project-sqlite/**'],
      deny: [],
    })
    expect(() => check('sqlite.read', '@project-sqlite:catalog')).not.toThrow()
  })

  it('@plugin-sqlite/** permission matches plugin-sqlite token', () => {
    const check = makePermissionChecker({
      allow: ['sqlite.read:@plugin-sqlite/**'],
      deny: [],
    })
    expect(() => check('sqlite.read', '@plugin-sqlite:test')).not.toThrow()
  })

  it('cache.read:@project-cache:chat-session matches exact token', () => {
    const check = makePermissionChecker({
      allow: ['cache.read:@project-cache:chat-session'],
      deny: [],
    })
    expect(() => check('cache.read', '@project-cache:chat-session')).not.toThrow()
    expect(() => check('cache.read', '@project-cache:other-session')).toThrow(PermissionError)
  })
})

describe('makePermissionChecker — dotfile paths', () => {
  it('fs.write:./** matches dotfile directory path', () => {
    const check = makePermissionChecker({ allow: ['fs.write:./**'], deny: [] })
    expect(() => check('fs.write', './.output/file.txt')).not.toThrow()
  })

  it('fs.read:./** matches nested dotfile path', () => {
    const check = makePermissionChecker({ allow: ['fs.read:./**'], deny: [] })
    expect(() => check('fs.read', './.hidden/sub/data.json')).not.toThrow()
  })

  it('fs.write:./** does not match paths outside project root', () => {
    const check = makePermissionChecker({ allow: ['fs.write:./**'], deny: [] })
    expect(() => check('fs.write', '../outside/file.txt')).toThrow(PermissionError)
  })
})

describe('makePermissionChecker — ws capability', () => {
  it('allows a matching ws permission', () => {
    const check = makePermissionChecker({ allow: ['ws.client:ws://localhost:3000/**'], deny: [] })
    expect(() => check('ws.client', 'ws://localhost:3000/chat')).not.toThrow()
  })

  it('throws PermissionError for unlisted ws URL', () => {
    const check = makePermissionChecker({ allow: ['ws.client:ws://localhost:3000/**'], deny: [] })
    expect(() => check('ws.client', 'ws://evil.com/data')).toThrow(PermissionError)
  })

  it('throws PermissionError when ws URL is in deny list', () => {
    const check = makePermissionChecker({
      allow: ['ws.client:ws://localhost:3000/**'],
      deny:  ['ws.client:ws://localhost:3000/admin/**'],
    })
    expect(() => check('ws.client', 'ws://localhost:3000/admin/control')).toThrow(PermissionError)
  })

  it('PermissionError carries ws capability and URL value', () => {
    const check = makePermissionChecker({ allow: [], deny: [] })
    let err
    try { check('ws.client', 'ws://localhost:3000/chat') } catch (e) { err = e }
    expect(err).toBeInstanceOf(PermissionError)
    expect(err.capability).toBe('ws.client')
    expect(err.value).toBe('ws://localhost:3000/chat')
  })

  it('wildcard ws:** allows any URL', () => {
    const check = makePermissionChecker({ allow: ['ws.client:**'], deny: [] })
    expect(() => check('ws.client', 'wss://api.example.com/stream')).not.toThrow()
  })
})

describe('rune.spawn / rune.kill / rune.exists permissions', () => {
  it('bare rune.spawn (no rune name) is not normalized to rune.spawn:*', () => {
    const result = computeEffectivePermissions({ use: { allow: ['rune.spawn'] } }, undefined, 'use')
    expect(result.allow).not.toContain('rune.spawn:*')
    expect(result.allow).toContain('rune.spawn')
  })

  it('bare rune.kill (no rune name) does not grant wildcard kill', () => {
    const result = computeEffectivePermissions({ use: { allow: ['rune.kill'] } }, undefined, 'use')
    expect(result.allow).not.toContain('rune.kill:*')
    const check = makePermissionChecker(result)
    expect(() => check('rune.kill', 'worker')).toThrow(PermissionError)
  })

  it('bare rune.exists (no rune name) does not grant wildcard exists', () => {
    const result = computeEffectivePermissions({ use: { allow: ['rune.exists'] } }, undefined, 'use')
    expect(result.allow).not.toContain('rune.exists:*')
    const check = makePermissionChecker(result)
    expect(() => check('rune.exists', 'worker')).toThrow(PermissionError)
  })

  it('rune.spawn:* in allow permits spawn of any rune key', () => {
    const check = makePermissionChecker({ allow: ['rune.spawn:*'], deny: [] })
    expect(() => check('rune.spawn', 'server-worker')).not.toThrow()
    expect(() => check('rune.spawn', 'any-other-rune')).not.toThrow()
  })

  it('rune.spawn:<key> permits only the named rune', () => {
    const check = makePermissionChecker({ allow: ['rune.spawn:worker'], deny: [] })
    expect(() => check('rune.spawn', 'worker')).not.toThrow()
    expect(() => check('rune.spawn', 'server')).toThrow(PermissionError)
  })

  it('no rune.spawn in allow throws PermissionError', () => {
    const check = makePermissionChecker({ allow: [], deny: [] })
    expect(() => check('rune.spawn', 'server-worker')).toThrow(PermissionError)
  })

  it('rune.kill:* in allow permits kill of jobs from any rune key', () => {
    const check = makePermissionChecker({ allow: ['rune.kill:*'], deny: [] })
    expect(() => check('rune.kill', 'worker')).not.toThrow()
    expect(() => check('rune.kill', 'server')).not.toThrow()
  })

  it('rune.kill:<key> permits only jobs started by the named rune', () => {
    const check = makePermissionChecker({ allow: ['rune.kill:worker'], deny: [] })
    expect(() => check('rune.kill', 'worker')).not.toThrow()
    expect(() => check('rune.kill', 'server')).toThrow(PermissionError)
  })

  it('rune.exists:* in allow permits exists check on jobs from any rune key', () => {
    const check = makePermissionChecker({ allow: ['rune.exists:*'], deny: [] })
    expect(() => check('rune.exists', 'worker')).not.toThrow()
  })

  it('rune.exists:<key> permits only jobs started by the named rune', () => {
    const check = makePermissionChecker({ allow: ['rune.exists:worker'], deny: [] })
    expect(() => check('rune.exists', 'worker')).not.toThrow()
    expect(() => check('rune.exists', 'server')).toThrow(PermissionError)
  })
})

describe('makePermissionChecker — db.connect capability', () => {
  it('allows db.connect when matched by allowance pattern', () => {
    const checker = makePermissionChecker({
      allow: ['db.connect:postgres:localhost:5432/dev_db'],
      deny: []
    })
    expect(() => checker('db.connect', 'postgres:localhost:5432/dev_db')).not.toThrow()
  })

  it('throws PermissionError when db.connect is denied', () => {
    const checker = makePermissionChecker({
      allow: ['db.connect:postgres:localhost:5432/**'],
      deny: ['db.connect:postgres:localhost:5432/prod_db']
    })
    expect(() => checker('db.connect', 'postgres:localhost:5432/prod_db')).toThrow(PermissionError)
  })
})
