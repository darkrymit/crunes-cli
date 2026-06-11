import { isMatch } from '../../shared/match.js'

export function matchFetchPermission(value, pattern) {
  // Value is formatted as "METHOD::URL"
  const vDoubleColon = value.indexOf('::')
  if (vDoubleColon === -1) return false

  const valueMethod = value.slice(0, vDoubleColon).toUpperCase()
  const valueUrl = value.slice(vDoubleColon + 2)

  let left = ''
  let right = ''

  const doubleColonIndex = pattern.indexOf('::')
  if (doubleColonIndex === -1) {
    left = ''
    right = pattern
  } else {
    left = pattern.slice(0, doubleColonIndex)
    right = pattern.slice(doubleColonIndex + 2)
  }

  const patternMethods = left ? left.split(',').map(m => m.trim().toUpperCase()) : ['GET']
  const patternUrl = right

  const methodOk = patternMethods.includes('*') || patternMethods.includes(valueMethod)
  const urlOk = isMatch(valueUrl, patternUrl)

  return methodOk && urlOk
}
