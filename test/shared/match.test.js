import { describe, it, expect } from 'vitest'
import { isGlobMatch, isWildcardMatch } from '../../src/shared/match.js'

describe('isGlobMatch', () => {
  it('* matches within a single path segment', () => {
    expect(isGlobMatch('src/index.js', 'src/*')).toBe(true)
    expect(isGlobMatch('src/sub/index.js', 'src/*')).toBe(false)
  })

  it('** matches across path segments', () => {
    expect(isGlobMatch('src/sub/index.js', 'src/**')).toBe(true)
    expect(isGlobMatch('other/index.js', 'src/**')).toBe(false)
  })

  it('matches exact paths', () => {
    expect(isGlobMatch('src/index.js', 'src/index.js')).toBe(true)
    expect(isGlobMatch('src/other.js', 'src/index.js')).toBe(false)
  })
})

describe('isWildcardMatch', () => {
  it('* matches any characters including slashes and spaces', () => {
    expect(isWildcardMatch('bash ./run.sh --profile=dev,staging,prod', ['bash *'])).toBe(true)
  })

  it('* matches across path separators in commands', () => {
    expect(isWildcardMatch('bash ./run.sh --profile=dev', ['bash ./run.sh *'])).toBe(true)
  })

  it('* matches up to a specific flag prefix', () => {
    expect(isWildcardMatch('bash ./run.sh --profile=dev,staging,prod', ['bash ./run.sh --profile=*'])).toBe(true)
  })

  it('** behaves identically to *', () => {
    expect(isWildcardMatch('bash ./run.sh', ['bash **'])).toBe(true)
  })

  it('exact match works without wildcards', () => {
    expect(isWildcardMatch('git status', ['git status'])).toBe(true)
    expect(isWildcardMatch('git status --short', ['git status'])).toBe(false)
  })

  it('does not match a different prefix', () => {
    expect(isWildcardMatch('npm install', ['bash *'])).toBe(false)
  })

  it('accepts a single string pattern (not array)', () => {
    expect(isWildcardMatch('npm run build', 'npm *')).toBe(true)
  })

  it('matches commas and special chars in value', () => {
    expect(isWildcardMatch('bash ./run.sh --profile=dev,staging,prod', ['bash *'])).toBe(true)
  })

  it('matches env key with wildcard', () => {
    expect(isWildcardMatch('GITHUB_TOKEN', ['GITHUB_*'])).toBe(true)
    expect(isWildcardMatch('DB_HOST', ['GITHUB_*'])).toBe(false)
  })

  it('matches flat cache/sqlite name with wildcard', () => {
    expect(isWildcardMatch('my-cache', ['my-*'])).toBe(true)
    expect(isWildcardMatch('other-cache', ['my-*'])).toBe(false)
  })

  it('* in pattern matches empty suffix', () => {
    expect(isWildcardMatch('bash', ['bash*'])).toBe(true)
  })
})
