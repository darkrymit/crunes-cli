import micromatch from 'micromatch'

export function matchFetchPermission(value, pattern) {
  const patternBody = pattern.startsWith('fetch:') ? pattern.slice(6) : pattern

  const vColon = value.indexOf(':')
  const pColon = patternBody.indexOf(':')
  if (vColon === -1 || pColon === -1) return false

  const valueMethod   = value.slice(0, vColon).toUpperCase()
  const valueUrl      = value.slice(vColon + 1)
  const patternMethod = patternBody.slice(0, pColon).toUpperCase()
  const patternUrl    = patternBody.slice(pColon + 1)

  const methodOk = patternMethod === '*' || patternMethod === valueMethod
  const urlOk    = micromatch.isMatch(valueUrl, patternUrl)

  return methodOk && urlOk
}
