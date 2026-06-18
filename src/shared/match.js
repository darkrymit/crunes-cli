import picomatch from 'picomatch'

export const isGlobMatch = (value, pattern) => picomatch.isMatch(value, pattern, { dot: true })

function wildcardToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  return new RegExp('^' + escaped.replace(/\*+/g, '[\\s\\S]*') + '$')
}

export const isWildcardMatch = (value, patterns) => {
  const list = Array.isArray(patterns) ? patterns : [patterns]
  return list.some(p => wildcardToRegex(p).test(value))
}
