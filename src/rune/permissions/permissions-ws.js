import micromatch from 'micromatch'

export function matchWsPermission(url, pattern) {
  const patternBody = pattern.startsWith('ws:') ? pattern.slice(3) : pattern
  return micromatch.isMatch(url, patternBody)
}
