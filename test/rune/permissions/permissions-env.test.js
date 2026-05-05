import { describe, it, expect } from 'vitest'
import { parseEnvPattern, matchEnvPermission } from '../../../src/rune/permissions/permissions-env.js'
import { makePermissionChecker, PermissionError } from '../../../src/rune/permissions/permissions.js'

describe('parseEnvPattern', () => {
  it('splits source and key pattern on last colon', () => {
    expect(parseEnvPattern('env:process:GITHUB_*')).toEqual({
      source: 'process',
      keyPattern: 'GITHUB_*',
    })
  })

  it('handles dotfile source names (.env.local)', () => {
    expect(parseEnvPattern('env:.env.local:API_*')).toEqual({
      source: '.env.local',
      keyPattern: 'API_*',
    })
  })

  it('handles wildcard key pattern', () => {
    expect(parseEnvPattern('env:process:*')).toEqual({
      source: 'process',
      keyPattern: '*',
    })
  })
})

describe('matchEnvPermission', () => {
  it('matches when source and key both match', () => {
    expect(matchEnvPermission('process:GITHUB_TOKEN', 'env:process:GITHUB_*')).toBe(true)
  })

  it('matches .env source', () => {
    expect(matchEnvPermission('.env:API_KEY', 'env:.env:API_*')).toBe(true)
  })

  it('rejects when source does not match', () => {
    expect(matchEnvPermission('.env.local:API_KEY', 'env:.env:API_*')).toBe(false)
  })

  it('rejects when key does not match glob', () => {
    expect(matchEnvPermission('process:DB_HOST', 'env:process:API_*')).toBe(false)
  })

  it('wildcard key pattern matches any key', () => {
    expect(matchEnvPermission('process:ANY_KEY', 'env:process:*')).toBe(true)
  })

  it('returns false for pattern without env: prefix', () => {
    expect(matchEnvPermission('process:TOKEN', 'fetch:GET:https://example.com')).toBe(false)
  })
})

describe('makePermissionChecker — env capability', () => {
  it('allows a matching env permission', () => {
    const check = makePermissionChecker({ allow: ['env:process:TOKEN'], deny: [] })
    expect(() => check('env', 'process:TOKEN')).not.toThrow()
  })

  it('throws PermissionError for unlisted source', () => {
    const check = makePermissionChecker({ allow: ['env:process:TOKEN'], deny: [] })
    expect(() => check('env', '.env:TOKEN')).toThrow(PermissionError)
  })

  it('throws PermissionError for unlisted key', () => {
    const check = makePermissionChecker({ allow: ['env:process:TOKEN'], deny: [] })
    expect(() => check('env', 'process:OTHER')).toThrow(PermissionError)
  })

  it('throws PermissionError when source:key is in deny list', () => {
    const check = makePermissionChecker({
      allow: ['env:process:SECRET'],
      deny:  ['env:process:SECRET'],
    })
    expect(() => check('env', 'process:SECRET')).toThrow(PermissionError)
  })

  it('PermissionError carries env capability and source:key value', () => {
    const check = makePermissionChecker({ allow: [], deny: [] })
    let err
    try { check('env', 'process:TOKEN') } catch (e) { err = e }
    expect(err).toBeInstanceOf(PermissionError)
    expect(err.capability).toBe('env')
    expect(err.value).toBe('process:TOKEN')
  })
})
