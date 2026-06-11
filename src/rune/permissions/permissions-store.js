import { isMatch } from '../../shared/match.js'

export function matchStorePermission(value, patterns) {
  const vDColon   = value.indexOf('::')
  const valueLoc  = vDColon >= 0 ? value.slice(0, vDColon)  : value
  const valueName = vDColon >= 0 ? value.slice(vDColon + 2) : null

  const sub = s => s.startsWith('./') ? '__DOT__/' + s.slice(2) : s

  return patterns.some(pattern => {
    const dColonIdx = pattern.indexOf('::')
    const patLoc  = dColonIdx !== -1 ? pattern.slice(0, dColonIdx) : pattern
    const patName = dColonIdx !== -1 ? pattern.slice(dColonIdx + 2) : null

    const nameOk = patName === '*' || patName == null ||
      (valueName != null && isMatch(valueName, patName))

    if (patLoc.startsWith('@') && patLoc.endsWith('/**')) {
      const bare = patLoc.slice(0, -3)
      return isMatch(valueLoc, [patLoc, bare]) && nameOk
    }

    return isMatch(sub(valueLoc), sub(patLoc)) && nameOk
  })
}
