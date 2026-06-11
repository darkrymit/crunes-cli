import { describe, it, expect } from 'vitest'
import { checkBatchPermission, buildMatchString } from '../../../src/rune/commands/batch-permission.js'

describe('buildMatchString', () => {
  it('returns just the key when no args', () => {
    expect(buildMatchString('release', [])).toBe('release')
  })

  it('joins key and args with spaces', () => {
    expect(buildMatchString('release', ['info', '--verbose'])).toBe('release info --verbose')
  })

  it('handles single arg', () => {
    expect(buildMatchString('m', ['rune'])).toBe('m rune')
  })
})

describe('checkBatchPermission', () => {
  it('returns denied when no batch block', () => {
    expect(checkBatchPermission({}, 'release')).toEqual({ allowed: false, reason: 'No batch block declared' })
  })

  it('returns denied when batch block is empty', () => {
    expect(checkBatchPermission({ batch: { allow: [], deny: [] } }, 'release')).toEqual({ allowed: false, reason: 'No matching allow pattern' })
  })

  it('returns allowed when allow wildcard matches', () => {
    expect(checkBatchPermission({ batch: { allow: ['*'] } }, 'm rune')).toEqual({ allowed: true })
  })

  it('returns allowed when allow prefix matches', () => {
    expect(checkBatchPermission({ batch: { allow: ['info*'] } }, 'release info --verbose')).toEqual({ allowed: true })
  })

  it('returns denied when allow prefix does not match', () => {
    expect(checkBatchPermission({ batch: { allow: ['info*'] } }, 'release bump --minor')).toEqual({ allowed: false, reason: 'No matching allow pattern' })
  })

  it('deny wins over allow', () => {
    expect(checkBatchPermission({ batch: { allow: ['*'], deny: ['*'] } }, 'release info')).toEqual({ allowed: false, reason: 'Matches deny pattern' })
  })

  it('deny pattern blocks specific args', () => {
    expect(checkBatchPermission({ batch: { allow: ['*'], deny: ['--refresh*'] } }, 'kb --refresh')).toEqual({ allowed: false, reason: 'Matches deny pattern' })
  })

  it('deny does not block non-matching args', () => {
    expect(checkBatchPermission({ batch: { allow: ['*'], deny: ['--refresh*'] } }, 'kb query')).toEqual({ allowed: true })
  })

  it('returns denied when batch block has no allow key', () => {
    expect(checkBatchPermission({ batch: { deny: ['*'] } }, 'deploy')).toEqual({ allowed: false, reason: 'Matches deny pattern' })
  })
})
