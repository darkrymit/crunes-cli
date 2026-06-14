import micromatch from 'micromatch'

const OPTS = { dot: true, noextglob: true, nonegate: true, nobrace: true, nobracket: true }

export const isGlobMatch = (value, pattern) => micromatch.isMatch(value, pattern, OPTS)

function wildcardToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  return new RegExp('^' + escaped.replace(/\*+/g, '[\\s\\S]*') + '$')
}

export const isWildcardMatch = (value, patterns) => {
  const list = Array.isArray(patterns) ? patterns : [patterns]
  return list.some(p => wildcardToRegex(p).test(value))
}
