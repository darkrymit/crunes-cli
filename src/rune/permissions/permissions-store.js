import micromatch from 'micromatch'

export function matchStorePermission(value, pattern, cap) {
  const prefix  = cap + ':'
  const patBody = pattern.startsWith(prefix) ? pattern.slice(prefix.length) : pattern

  // Split token into location and name at last ':'
  const vColon    = value.lastIndexOf(':')
  const valueLoc  = vColon >= 0 ? value.slice(0, vColon)  : value
  const valueName = vColon >= 0 ? value.slice(vColon + 1) : null

  if (patBody.startsWith('@')) {
    // Virtual root path pattern — no name component in pattern.
    // /** means "root AND all subpaths": expand to also match the bare prefix.
    if (patBody.endsWith('/**')) {
      const bare = patBody.slice(0, -3)
      return micromatch.isMatch(valueLoc, [patBody, bare], { dot: true })
    }
    return micromatch.isMatch(valueLoc, patBody, { dot: true })
  }

  // Regular path — pattern may or may not carry a name restriction.
  const pColon  = patBody.lastIndexOf(':')
  const patLoc  = pColon >= 0 ? patBody.slice(0, pColon)  : patBody
  const patName = pColon >= 0 ? patBody.slice(pColon + 1) : null  // null = any name

  const locOk  = micromatch.isMatch(valueLoc,  patLoc,  { dot: true })
  const nameOk = patName == null ||
    (valueName != null && micromatch.isMatch(valueName, patName, { dot: true }))
  return locOk && nameOk
}
