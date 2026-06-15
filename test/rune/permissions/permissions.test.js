import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
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

  it('sqlite.read with regular path still normalizes ::name', () => {
    const result = computeEffectivePermissions(
      { use: { allow: ['sqlite.read:mydb::default'] } },
      undefined, 'use'
    )
    expect(result.allow).toEqual(['sqlite.read:./mydb::default'])
  })

  it('@project-sqlite/** permission matches subpath token', () => {
    const check = makePermissionChecker({
      allow: ['sqlite.read:@project-sqlite/**'],
      deny: [],
    })
    expect(() => check('sqlite.read', '@project-sqlite/data::mydb')).not.toThrow()
    expect(() => check('sqlite.read', '@project-sqlite/a/b::mydb')).not.toThrow()
  })

  it('@project-sqlite/** permission matches root-level token', () => {
    const check = makePermissionChecker({
      allow: ['sqlite.read:@project-sqlite/**'],
      deny: [],
    })
    expect(() => check('sqlite.read', '@project-sqlite::catalog')).not.toThrow()
  })

  it('@plugin-sqlite/** permission matches plugin-sqlite token', () => {
    const check = makePermissionChecker({
      allow: ['sqlite.read:@plugin-sqlite/**'],
      deny: [],
    })
    expect(() => check('sqlite.read', '@plugin-sqlite::test')).not.toThrow()
  })

  it('cache.read:@project-cache::chat-session matches exact token', () => {
    const check = makePermissionChecker({
      allow: ['cache.read:@project-cache::chat-session'],
      deny: [],
    })
    expect(() => check('cache.read', '@project-cache::chat-session')).not.toThrow()
    expect(() => check('cache.read', '@project-cache::other-session')).toThrow(PermissionError)
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

describe('rune.job.write / shell.job.write permissions', () => {
  it('rune.job.write in allow permits write', () => {
    const check = makePermissionChecker({ allow: ['rune.job.write'], deny: [] })
    expect(() => check('rune.job.write', null)).not.toThrow()
  })

  it('rune.job.write absent throws PermissionError', () => {
    const check = makePermissionChecker({ allow: [], deny: [] })
    expect(() => check('rune.job.write', null)).toThrow(PermissionError)
  })

  it('rune.job.write in deny blocks even when in allow', () => {
    const check = makePermissionChecker({ allow: ['rune.job.write'], deny: ['rune.job.write'] })
    expect(() => check('rune.job.write', null)).toThrow(PermissionError)
  })

  it('shell.job.write in allow permits write', () => {
    const check = makePermissionChecker({ allow: ['shell.job.write'], deny: [] })
    expect(() => check('shell.job.write', null)).not.toThrow()
  })

  it('shell.job.write absent throws PermissionError', () => {
    const check = makePermissionChecker({ allow: [], deny: [] })
    expect(() => check('shell.job.write', null)).toThrow(PermissionError)
  })

  it('shell.job.write in deny blocks even when in allow', () => {
    const check = makePermissionChecker({ allow: ['shell.job.write'], deny: ['shell.job.write'] })
    expect(() => check('shell.job.write', null)).toThrow(PermissionError)
  })
})


describe('makePermissionChecker — expandPattern siblings (ctx)', () => {
  const dir = '/home/user/myproject'
  const ctx = { dir }

  it('relative pattern ./src/** also matches its absolute form', () => {
    const check = makePermissionChecker(
      { allow: ['fs.read:./src/**'], deny: [] },
      ctx
    )
    expect(() => check('fs.read', `${dir}/src/index.js`)).not.toThrow()
    expect(() => check('fs.read', './src/index.js')).not.toThrow()
  })

  it('absolute pattern inside dir also matches relative form', () => {
    const check = makePermissionChecker(
      { allow: [`fs.read:${dir}/src/**`], deny: [] },
      ctx
    )
    expect(() => check('fs.read', './src/index.js')).not.toThrow()
    expect(() => check('fs.read', `${dir}/src/index.js`)).not.toThrow()
  })

  it('absolute pattern outside dir gets no sibling', () => {
    const check = makePermissionChecker(
      { allow: ['fs.read:/etc/hosts'], deny: [] },
      ctx
    )
    expect(() => check('fs.read', '/etc/hosts')).not.toThrow()
    expect(() => check('fs.read', './etc/hosts')).toThrow(PermissionError)
  })

  it('@local-project-cache/** pattern matches its real absolute path', () => {
    const check = makePermissionChecker(
      { allow: ['fs.read:@local-project-cache/**'], deny: [] },
      ctx
    )
    // The real path for @local-project-cache is <dir>/.crunes/caches/project
    expect(() => check('fs.read', `${dir}/.crunes/caches/project/vault/file.enc`)).not.toThrow()
  })

  it('@local-project-cache/sub/** pattern matches absolute subpath', () => {
    const check = makePermissionChecker(
      { allow: ['fs.read:@local-project-cache/vault/**'], deny: [] },
      ctx
    )
    expect(() => check('fs.read', `${dir}/.crunes/caches/project/vault/secret.json`)).not.toThrow()
    expect(() => check('fs.read', `${dir}/.crunes/caches/project/other/file`)).toThrow(PermissionError)
  })

  it('no ctx — no sibling expansion, original pattern still checked', () => {
    const check = makePermissionChecker(
      { allow: ['fs.read:./src/**'], deny: [] }
    )
    expect(() => check('fs.read', './src/index.js')).not.toThrow()
    expect(() => check('fs.read', `${dir}/src/index.js`)).toThrow(PermissionError)
  })

  it('deny fs pattern is also expanded with ctx', () => {
    const check = makePermissionChecker(
      { allow: ['fs.read:./**'], deny: ['fs.read:./secret/**'] },
      ctx
    )
    expect(() => check('fs.read', `${dir}/secret/file.txt`)).toThrow(PermissionError)
    expect(() => check('fs.read', './secret/file.txt')).toThrow(PermissionError)
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

describe('expandPattern — full sibling coverage via makePermissionChecker', () => {
  const dir = '/home/user/myproject'
  const ctx = { dir }

  it('bare fs pattern matches ./rel, bare, absolute, and @project/ forms', () => {
    const check = makePermissionChecker({ allow: ['fs.read:src/**'], deny: [] }, ctx)
    expect(() => check('fs.read', './src/index.js')).not.toThrow()
    expect(() => check('fs.read', 'src/index.js')).not.toThrow()
    expect(() => check('fs.read', `${dir}/src/index.js`)).not.toThrow()
    expect(() => check('fs.read', '@project/src/index.js')).not.toThrow()
  })

  it('@project/ fs pattern matches ./rel, bare, and absolute forms', () => {
    const check = makePermissionChecker({ allow: ['fs.read:@project/src/**'], deny: [] }, ctx)
    expect(() => check('fs.read', './src/index.js')).not.toThrow()
    expect(() => check('fs.read', 'src/index.js')).not.toThrow()
    expect(() => check('fs.read', `${dir}/src/index.js`)).not.toThrow()
  })

  it('absolute fs pattern inside dir matches ./rel, bare, and @project/ forms', () => {
    const check = makePermissionChecker({ allow: [`fs.read:${dir}/src/**`], deny: [] }, ctx)
    expect(() => check('fs.read', './src/index.js')).not.toThrow()
    expect(() => check('fs.read', 'src/index.js')).not.toThrow()
    expect(() => check('fs.read', '@project/src/index.js')).not.toThrow()
  })

  it('~/path fs pattern emits HOME sibling, not relative forms', () => {
    const HOME = process.env.HOME || require('os').homedir()
    const check = makePermissionChecker({ allow: ['fs.read:~/docs/**'], deny: [] }, ctx)
    expect(() => check('fs.read', `${HOME}/docs/note.txt`)).not.toThrow()
    expect(() => check('fs.read', './docs/note.txt')).toThrow(PermissionError)
  })

  it('cache @local-project-cache pattern matches raw token, absolute, ./rel, bare, @project/ forms', () => {
    // @local-project-cache resolves to <dir>/.crunes/caches/project
    const check = makePermissionChecker(
      { allow: ['cache.read:@local-project-cache/vault::mydb'], deny: [] },
      ctx
    )
    // raw token form
    expect(() => check('cache.read', '@local-project-cache/vault::mydb')).not.toThrow()
    // absolute form
    expect(() => check('cache.read', `${dir}/.crunes/caches/project/vault::mydb`)).not.toThrow()
    // ./rel form
    expect(() => check('cache.read', './.crunes/caches/project/vault::mydb')).not.toThrow()
    // bare form
    expect(() => check('cache.read', '.crunes/caches/project/vault::mydb')).not.toThrow()
    // @project/ form
    expect(() => check('cache.read', '@project/.crunes/caches/project/vault::mydb')).not.toThrow()
  })

  it('sqlite @local-project-sqlite pattern matches raw token and absolute form', () => {
    const check = makePermissionChecker(
      { allow: ['sqlite.read:@local-project-sqlite/**::*'], deny: [] },
      ctx
    )
    expect(() => check('sqlite.read', '@local-project-sqlite/sub::mydb')).not.toThrow()
    expect(() => check('sqlite.read', `${dir}/.crunes/sqlite/project/sub::mydb`)).not.toThrow()
  })

  it('@global-project-cache pattern emits absolute sibling only — no relative siblings', () => {
    const check = makePermissionChecker(
      { allow: ['cache.read:@global-project-cache/ns::bucket'], deny: [] },
      ctx
    )
    // raw token still works
    expect(() => check('cache.read', '@global-project-cache/ns::bucket')).not.toThrow()
    // ./rel form should NOT match (global resolves outside dir)
    expect(() => check('cache.read', './.crunes/caches/ns::bucket')).toThrow(PermissionError)
  })

  it('raw absolute cache location matches @local-project-cache pattern', () => {
    // The core scenario: rune passes absolute path to cache.open
    const absLoc = `${dir}/.crunes/caches/project`
    const check = makePermissionChecker(
      { allow: ['cache.read:@local-project-cache::vault'], deny: [] },
      ctx
    )
    expect(() => check('cache.read', `${absLoc}::vault`)).not.toThrow()
  })

  it('../esc fs pattern emits no siblings', () => {
    const check = makePermissionChecker({ allow: ['fs.read:../sibling/**'], deny: [] }, ctx)
    expect(() => check('fs.read', '../sibling/file.txt')).not.toThrow()
    expect(() => check('fs.read', './sibling/file.txt')).toThrow(PermissionError)
  })

  it('./** pattern with ctx matches absolute path inside dir but not outside', () => {
    const check = makePermissionChecker({ allow: ['fs.read:./**'], deny: [] }, ctx)
    expect(() => check('fs.read', `${dir}/src/index.js`)).not.toThrow()
    expect(() => check('fs.read', `${dir}/.hidden/file`)).not.toThrow()
    expect(() => check('fs.read', '/etc/passwd')).toThrow(PermissionError)
    expect(() => check('fs.read', '/home/user/otherproject/file.txt')).toThrow(PermissionError)
  })
})

describe('makePermissionChecker — shell.run wildcard matching', () => {
  it('bash * matches command with path separators and flags', () => {
    const check = makePermissionChecker({ allow: ['shell.run:bash *'], deny: [] })
    expect(() => check('shell.run', 'bash ./run.sh --profile=dev,staging,prod')).not.toThrow()
  })

  it('bash ./run.sh * matches any args to specific script', () => {
    const check = makePermissionChecker({ allow: ['shell.run:bash ./run.sh *'], deny: [] })
    expect(() => check('shell.run', 'bash ./run.sh --profile=dev')).not.toThrow()
    expect(() => check('shell.run', 'npm install')).toThrow(PermissionError)
  })

  it('bash ./run.sh --profile=* matches any profile value', () => {
    const check = makePermissionChecker({ allow: ['shell.run:bash ./run.sh --profile=*'], deny: [] })
    expect(() => check('shell.run', 'bash ./run.sh --profile=dev,staging,prod')).not.toThrow()
    expect(() => check('shell.run', 'bash ./run.sh --other')).toThrow(PermissionError)
  })

  it('npm * matches any npm command', () => {
    const check = makePermissionChecker({ allow: ['shell.run:npm *'], deny: [] })
    expect(() => check('shell.run', 'npm run build')).not.toThrow()
    expect(() => check('shell.run', 'npm install')).not.toThrow()
    expect(() => check('shell.run', 'bash something')).toThrow(PermissionError)
  })

  it('shell.job.start: bash * matches command with slashes', () => {
    const check = makePermissionChecker({ allow: ['shell.job.start:bash *'], deny: [] })
    expect(() => check('shell.job.start', 'bash ./run.sh --profile=dev,staging,prod')).not.toThrow()
  })

  it('db.connect:postgres:* matches any postgres URI', () => {
    const check = makePermissionChecker({ allow: ['db.connect:postgres:*'], deny: [] })
    expect(() => check('db.connect', 'postgres:localhost:5432/mydb')).not.toThrow()
    expect(() => check('db.connect', 'mysql:localhost:3306/mydb')).toThrow(PermissionError)
  })
})
