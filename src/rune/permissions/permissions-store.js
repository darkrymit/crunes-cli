import micromatch from 'micromatch'

export function matchStorePermission(value, pattern, cap) {
  const prefix  = cap + ':'
  const patBody = pattern.startsWith(prefix) ? pattern.slice(prefix.length) : pattern

  // Split value into location and name at '::'
  const vDColon   = value.indexOf('::')
  const valueLoc  = vDColon >= 0 ? value.slice(0, vDColon)  : value
  const valueName = vDColon >= 0 ? value.slice(vDColon + 2) : null

  // Split pattern into location and name at '::'
  const dColonIdx = patBody.indexOf('::')
  const patLoc = dColonIdx !== -1 ? patBody.slice(0, dColonIdx) : patBody
  const patName = dColonIdx !== -1 ? patBody.slice(dColonIdx + 2) : null

  if (patLoc.startsWith('@')) {
    if (patLoc.endsWith('/**')) {
      const bare = patLoc.slice(0, -3)
      const locOk = micromatch.isMatch(valueLoc, [patLoc, bare], { dot: true })
      const nameOk = patName === '*' || patName == null ||
        (valueName != null && micromatch.isMatch(valueName, patName, { dot: true }))
      return locOk && nameOk
    }
  }

  const locOk  = micromatch.isMatch(valueLoc, patLoc, { dot: true })
  const nameOk = patName === '*' || patName == null ||
    (valueName != null && micromatch.isMatch(valueName, patName, { dot: true }))
  return locOk && nameOk
}
