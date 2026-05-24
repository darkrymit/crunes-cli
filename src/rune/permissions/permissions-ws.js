import micromatch from 'micromatch'

export function matchWsPermission(url, pattern) {
  const patternBody = pattern.startsWith('ws.client:') ? pattern.slice(10) : pattern
  return micromatch.isMatch(url, patternBody)
}
