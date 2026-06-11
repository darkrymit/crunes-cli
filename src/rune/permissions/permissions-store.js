import os from 'node:os'
import { isMatch } from '../../shared/match.js'

const HOME = os.homedir().replace(/\\/g, '/')

export function matchStorePermission(value, pattern) {
  // Split value into location and name at '::'
  const vDColon   = value.indexOf('::')
  const valueLoc  = vDColon >= 0 ? value.slice(0, vDColon)  : value
  const valueName = vDColon >= 0 ? value.slice(vDColon + 2) : null

  // Split pattern into location and name at '::'
  const dColonIdx = pattern.indexOf('::')
  const patLoc = dColonIdx !== -1 ? pattern.slice(0, dColonIdx) : pattern
  const patName = dColonIdx !== -1 ? pattern.slice(dColonIdx + 2) : null

  if (patLoc.startsWith('@')) {
    if (patLoc.endsWith('/**')) {
      const bare = patLoc.slice(0, -3)
      const locOk = isMatch(valueLoc, [patLoc, bare])
      const nameOk = patName === '*' || patName == null ||
        (valueName != null && isMatch(valueName, patName))
      return locOk && nameOk
    }
  }

  const locOk  = isMatch(
    valueLoc.startsWith('~/') ? HOME + valueLoc.slice(1) : valueLoc,
    patLoc.startsWith('~/') ? HOME + patLoc.slice(1) : patLoc,
    { dot: true, noextglob: true, nonegate: true, nobrace: true, nobracket: true }
  )
  const nameOk = patName === '*' || patName == null ||
    (valueName != null && isMatch(valueName, patName))
  return locOk && nameOk
}
