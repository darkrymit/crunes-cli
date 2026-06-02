import micromatch from 'micromatch'

export function matchFetchPermission(value, pattern) {
  const patternBody = pattern.startsWith('http.fetch:') ? pattern.slice(11) : pattern

  // Value is always formatted as "METHOD:URL"
  const vColon = value.indexOf(':')
  if (vColon === -1) return false

  const valueMethod = value.slice(0, vColon).toUpperCase()
  const valueUrl = value.slice(vColon + 1)

  let left = ''
  let right = ''

  const doubleColonIndex = patternBody.indexOf('::')
  if (doubleColonIndex === -1) {
    left = ''
    right = patternBody
  } else {
    left = patternBody.slice(0, doubleColonIndex)
    right = patternBody.slice(doubleColonIndex + 2)
  }

  const patternMethods = left ? left.split(',').map(m => m.trim().toUpperCase()) : ['GET']
  const patternUrl = right

  const methodOk = patternMethods.includes('*') || patternMethods.includes(valueMethod)
  const urlOk = micromatch.isMatch(valueUrl, patternUrl)

  return methodOk && urlOk
}
