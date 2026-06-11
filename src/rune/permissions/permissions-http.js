import { isMatch } from '../../shared/match.js'

export function matchFetchPermission(value, patterns) {
  // Value is formatted as "METHOD::URL"
  const vDoubleColon = value.indexOf('::')
  if (vDoubleColon === -1) return false

  const valueMethod = value.slice(0, vDoubleColon).toUpperCase()
  const valueUrl = value.slice(vDoubleColon + 2)

  return patterns.some(pattern => {
    const doubleColonIndex = pattern.indexOf('::')
    const left  = doubleColonIndex === -1 ? '' : pattern.slice(0, doubleColonIndex)
    const right = doubleColonIndex === -1 ? pattern : pattern.slice(doubleColonIndex + 2)

    const patternMethods = left ? left.split(',').map(m => m.trim().toUpperCase()) : ['GET']
    const methodOk = patternMethods.includes('*') || patternMethods.includes(valueMethod)
    return methodOk && isMatch(valueUrl, right)
  })
}
