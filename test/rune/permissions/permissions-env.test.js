import { describe, it, expect } from 'vitest'
import { parseEnvPattern, matchEnvPermission } from '../../../src/rune/permissions/permissions-env.js'
import { makePermissionChecker, PermissionError } from '../../../src/rune/permissions/permissions.js'

describe('parseEnvPattern', () => {
  it('splits source and key pattern on double-colon', () => {
    expect(parseEnvPattern('env.read:process::GITHUB_*')).toEqual({
      sources: ['process'],
      keyPatterns: ['GITHUB_*'],
    })
  })

  it('handles dotfile source names (.env.local)', () => {
    expect(parseEnvPattern('env.read:.env.local::API_*')).toEqual({
      sources: ['.env.local'],
      keyPatterns: ['API_*'],
    })
  })

  it('handles wildcard key pattern', () => {
    expect(parseEnvPattern('env.read:process::*')).toEqual({
      sources: ['process'],
      keyPatterns: ['*'],
    })
  })

  it('handles comma-separated sources and keys', () => {
    expect(parseEnvPattern('env.read:process,.env::PORT,API_KEY')).toEqual({
      sources: ['process', '.env'],
      keyPatterns: ['PORT', 'API_KEY'],
    })
  })

  it('defaults to process source if source is omitted before double-colon', () => {
    expect(parseEnvPattern('env.read:::PORT')).toEqual({
      sources: ['process'],
      keyPatterns: ['PORT'],
    })
  })

  it('interprets pattern without double-colon as key pattern on wildcard source', () => {
    expect(parseEnvPattern('env.read:TOKEN')).toEqual({
      sources: ['*'],
      keyPatterns: ['TOKEN'],
    })
  })
})

describe('matchEnvPermission', () => {
  it('matches when source and key both match', () => {
    expect(matchEnvPermission('process::GITHUB_TOKEN', ['process::GITHUB_*'])).toBe(true)
  })

  it('matches .env source', () => {
    expect(matchEnvPermission('.env::API_KEY', ['.env::API_*'])).toBe(true)
  })

  it('rejects when source does not match', () => {
    expect(matchEnvPermission('.env.local::API_KEY', ['.env::API_*'])).toBe(false)
  })

  it('rejects when key does not match glob', () => {
    expect(matchEnvPermission('process::DB_HOST', ['process::API_*'])).toBe(false)
  })

  it('wildcard key pattern matches any key', () => {
    expect(matchEnvPermission('process::ANY_KEY', ['process::*'])).toBe(true)
  })

  it('supports * wildcard key matching on any source', () => {
    expect(matchEnvPermission('process::API_KEY', ['*'])).toBe(true)
    expect(matchEnvPermission('.env::API_KEY', ['*'])).toBe(true)
  })

  it('supports KEY_NAME single-argument wildcard source matching for specific key', () => {
    expect(matchEnvPermission('process::TOKEN', ['TOKEN'])).toBe(true)
    expect(matchEnvPermission('.env::TOKEN', ['TOKEN'])).toBe(true)
    expect(matchEnvPermission('.env::OTHER', ['TOKEN'])).toBe(false)
  })

  it('supports comma-separated sources and comma-separated keys with positional double-colon', () => {
    expect(matchEnvPermission('process::PORT', ['process,.env::PORT,API_KEY'])).toBe(true)
    expect(matchEnvPermission('.env::API_KEY', ['process,.env::PORT,API_KEY'])).toBe(true)
    expect(matchEnvPermission('.env::OTHER', ['process,.env::PORT,API_KEY'])).toBe(false)
  })

  it('rejects legacy single-colon patterns without double-colon', () => {
    expect(matchEnvPermission('process::TOKEN', ['process:TOKEN'])).toBe(false)
  })
})

describe('makePermissionChecker — env.read capability', () => {
  it('allows a matching env permission', () => {
    const check = makePermissionChecker({ allow: ['env.read:process::TOKEN'], deny: [] })
    expect(() => check('env.read', 'process::TOKEN')).not.toThrow()
  })

  it('throws PermissionError for unlisted source', () => {
    const check = makePermissionChecker({ allow: ['env.read:process::TOKEN'], deny: [] })
    expect(() => check('env.read', '.env::TOKEN')).toThrow(PermissionError)
  })

  it('throws PermissionError for unlisted key', () => {
    const check = makePermissionChecker({ allow: ['env.read:process::TOKEN'], deny: [] })
    expect(() => check('env.read', 'process::OTHER')).toThrow(PermissionError)
  })

  it('throws PermissionError when source:key is in deny list', () => {
    const check = makePermissionChecker({
      allow: ['env.read:process::SECRET'],
      deny:  ['env.read:process::SECRET'],
    })
    expect(() => check('env.read', 'process::SECRET')).toThrow(PermissionError)
  })

  it('PermissionError carries env.read capability and source::key value', () => {
    const check = makePermissionChecker({ allow: [], deny: [] })
    let err
    try { check('env.read', 'process::TOKEN') } catch (e) { err = e }
    expect(err).toBeInstanceOf(PermissionError)
    expect(err.capability).toBe('env.read')
    expect(err.value).toBe('process::TOKEN')
  })
})
