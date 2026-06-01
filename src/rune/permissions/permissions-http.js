import micromatch from 'micromatch'

export function matchFetchPermission(value, pattern) {
  const patternBody = pattern.startsWith('http.fetch:') ? pattern.slice(11) : pattern

  // Value is always formatted as "METHOD:URL"
  const vColon = value.indexOf(':')
  if (vColon === -1) return false

  const valueMethod = value.slice(0, vColon).toUpperCase()
  const valueUrl = value.slice(vColon + 1)

  let patternMethods = []
  let patternUrl = ''

  const doubleColonIndex = patternBody.indexOf('::')
  if (doubleColonIndex !== -1) {
    const left = patternBody.slice(0, doubleColonIndex)
    const right = patternBody.slice(doubleColonIndex + 2)
    patternMethods = left.split(',').map(m => m.trim().toUpperCase())
    patternUrl = right
  } else {
    const singleColonIndex = patternBody.indexOf(':')
    if (singleColonIndex === -1) return false

    const prefix = patternBody.slice(0, singleColonIndex).toUpperCase()
    const remainder = patternBody.slice(singleColonIndex + 1)

    if (prefix === 'HTTP' || prefix === 'HTTPS' || remainder.startsWith('//')) {
      patternMethods = ['*']
      patternUrl = patternBody
    } else {
      patternMethods = prefix.split(',').map(m => m.trim().toUpperCase())
      patternUrl = remainder
    }
  }

  const methodOk = patternMethods.includes('*') || patternMethods.includes(valueMethod)
  const urlOk = micromatch.isMatch(valueUrl, patternUrl)

  return methodOk && urlOk
}
