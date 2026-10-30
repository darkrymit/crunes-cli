import { describe, it, expect } from 'vitest'
import { makePermissionChecker, PermissionError } from '../../../src/rune/permissions/permissions.js'
import { createEnvUtils } from '../../../src/rune/api/env.js'
import { formatConsentScreen } from '../../../src/plugin/consent.js'

describe('permissions wildcard (allow: ["*"])', () => {
  it('allows all capabilities when allow includes "*"', () => {
    const check = makePermissionChecker({ allow: ['*'], deny: [] })

    // Filesystem
    expect(() => check('fs.read', './src/index.js')).not.toThrow()
    expect(() => check('fs.write', './dist/bundle.js')).not.toThrow()
    expect(() => check('fs.exists', './package.json')).not.toThrow()
    expect(() => check('fs.glob', '**/*.js')).not.toThrow()

    // Shell
    expect(() => check('shell.run', 'git status')).not.toThrow()
    expect(() => check('shell.job.start', 'npm test')).not.toThrow()

    // Runes
    expect(() => check('rune.run', 'other-rune')).not.toThrow()
    expect(() => check('rune.repl', 'other-rune')).not.toThrow()
    expect(() => check('rune.job.start', 'other-rune')).not.toThrow()

    // HTTP & WS
    expect(() => check('http.fetch', 'GET::https://api.github.com/repos')).not.toThrow()
    expect(() => check('http.server', '0.0.0.0:8080')).not.toThrow()
    expect(() => check('ws.client', 'wss://echo.websocket.org')).not.toThrow()
    expect(() => check('ws.server', '0.0.0.0:8081:/ws')).not.toThrow()

    // Storage & DB
    expect(() => check('sqlite.read', './data::main')).not.toThrow()
    expect(() => check('sqlite.write', './data::main')).not.toThrow()
    expect(() => check('cache.read', './cache::items')).not.toThrow()
    expect(() => check('cache.write', './cache::items')).not.toThrow()
    expect(() => check('db.connect', 'postgres://localhost/db')).not.toThrow()

    // Bare capabilities
    expect(() => check('rune.job.kill', '')).not.toThrow()
    expect(() => check('shell.job.kill', '')).not.toThrow()
    expect(() => check('notify.send', '')).not.toThrow()
  })

  it('treats "*:*" as an alias for "*"', () => {
    const check = makePermissionChecker({ allow: ['*:*'], deny: [] })

    expect(() => check('fs.read', './src/app.js')).not.toThrow()
    expect(() => check('shell.run', 'cargo build')).not.toThrow()
    expect(() => check('http.fetch', 'POST::https://example.com/api')).not.toThrow()
  })

  it('enforces specific deny rules even when allow: ["*"] is set', () => {
    const check = makePermissionChecker({
      allow: ['*'],
      deny: ['fs.write:./.env*', 'shell.run:rm *', 'env.read:process::SECRET_*'],
    })

    // Allowed because not matched by deny
    expect(() => check('fs.read', './.env')).not.toThrow()
    expect(() => check('fs.write', './dist/app.js')).not.toThrow()
    expect(() => check('shell.run', 'git status')).not.toThrow()

    // Denied by specific deny patterns
    expect(() => check('fs.write', './.env')).toThrow(PermissionError)
    expect(() => check('fs.write', './.env.local')).toThrow(PermissionError)
    expect(() => check('shell.run', 'rm -rf /tmp/data')).toThrow(PermissionError)
  })

  it('deny: ["*"] blocks everything even if allow: ["*"] is present', () => {
    const check = makePermissionChecker({
      allow: ['*'],
      deny: ['*'],
    })

    expect(() => check('fs.read', './src/index.js')).toThrow(PermissionError)
    expect(() => check('shell.run', 'echo hello')).toThrow(PermissionError)
    expect(() => check('notify.send', '')).toThrow(PermissionError)
    expect(() => check('fs.glob', '*.js')).toThrow(PermissionError)
  })

  it('allows env.read across sources when allow includes "*"', () => {
    const prev = process.env.TEST_CRUNES_WILDCARD
    try {
      process.env.TEST_CRUNES_WILDCARD = 'wildcard-val'
      const check = makePermissionChecker({ allow: ['*'], deny: [] })
      const env = createEnvUtils(process.cwd(), check, { allow: ['*'], deny: [] })

      expect(env.has('TEST_CRUNES_WILDCARD')).toBe(true)
      expect(env.read('TEST_CRUNES_WILDCARD')).toBe('wildcard-val')
    } finally {
      if (prev === undefined) delete process.env.TEST_CRUNES_WILDCARD
      else process.env.TEST_CRUNES_WILDCARD = prev
    }
  })

  it('formats unrestricted notice in plugin consent screen when rune requests "*"', () => {
    const screen = formatConsentScreen('super-plugin', {
      format: '1',
      runes: {
        admin: {
          run: {
            command: 'runes/admin.rune.js',
            permissions: { allow: ['*'] },
          },
        },
      },
    })

    expect(screen).toContain('UNRESTRICTED: allows all filesystem, shell, network, and environment operations')
  })
})
