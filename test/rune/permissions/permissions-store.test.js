import { describe, it, expect } from 'vitest'
import { matchStorePermission } from '../../../src/rune/permissions/permissions-store.js'

describe('matchStorePermission', () => {
  it('splits on double colon and ignores single colons in Windows absolute path locations', () => {
    expect(matchStorePermission(
      'C:\\databases\\main:users',
      'sqlite.read:C:\\databases\\main::users',
      'sqlite.read'
    )).toBe(true)
  })

  it('permits access when name is omitted/null (any entity/table allowed)', () => {
    expect(matchStorePermission(
      'C:\\databases\\main:users',
      'sqlite.read:C:\\databases\\main',
      'sqlite.read'
    )).toBe(true)
  })

  it('rejects access when name does not match restricted name', () => {
    expect(matchStorePermission(
      'C:\\databases\\main:orders',
      'sqlite.read:C:\\databases\\main::users',
      'sqlite.read'
    )).toBe(false)
  })

  it('supports asterisk wildcard for any table/bucket restriction', () => {
    expect(matchStorePermission(
      'C:\\databases\\main:orders',
      'sqlite.read:C:\\databases\\main::*',
      'sqlite.read'
    )).toBe(true)
  })

  it('does NOT fall back to single-colon parsing (rejects legacy format)', () => {
    // Single colon is now parsed as part of the location, meaning the value 'users' won't match.
    expect(matchStorePermission(
      './db:users',
      'sqlite.read:./db:users',
      'sqlite.read'
    )).toBe(false)
  })

  it('correctly handles virtual root path locations with double colons', () => {
    expect(matchStorePermission(
      '@project/data.sqlite:users',
      'sqlite.read:@project/data.sqlite::users',
      'sqlite.read'
    )).toBe(true)

    expect(matchStorePermission(
      '@project/data.sqlite:orders',
      'sqlite.read:@project/data.sqlite::users',
      'sqlite.read'
    )).toBe(false)
  })

  it('correctly handles virtual root wildcards with /**', () => {
    expect(matchStorePermission(
      '@project/db/main:users',
      'sqlite.read:@project/db/**::users',
      'sqlite.read'
    )).toBe(true)

    expect(matchStorePermission(
      '@project/db/main:orders',
      'sqlite.read:@project/db/**::users',
      'sqlite.read'
    )).toBe(false)
  })
})
