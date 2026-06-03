import micromatch from 'micromatch'

export function parseEnvPattern(pattern) {
  const body = pattern.startsWith('env.read:') ? pattern.slice(9) : pattern
  
  const dColonIdx = body.indexOf('::')
  
  if (dColonIdx === -1) {
    return { sources: ['*'], keyPatterns: [body] }
  }
  
  const left = body.slice(0, dColonIdx)
  const right = body.slice(dColonIdx + 2)
  
  return {
    sources: left ? left.split(',').map(s => s.trim()) : ['process'],
    keyPatterns: right.split(',').map(k => k.trim())
  }
}

// value: 'source::key' e.g. 'process::TOKEN' or '.env::API_KEY'
export function matchEnvPermission(value, pattern) {
  if (!pattern.startsWith('env.read:')) return false
  const dColonIdx = value.indexOf('::')
  if (dColonIdx === -1) return false

  const valueSource = value.slice(0, dColonIdx)
  const valueKey    = value.slice(dColonIdx + 2)
  
  const { sources, keyPatterns } = parseEnvPattern(pattern)
  
  const sourceOk = sources.includes('*') || sources.includes(valueSource)
  const keyOk = keyPatterns.some(pat => micromatch.isMatch(valueKey, pat))
  
  return sourceOk && keyOk
}
