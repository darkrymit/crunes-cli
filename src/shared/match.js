import micromatch from 'micromatch'

const OPTS = { dot: true, noextglob: true, nonegate: true, nobrace: true, nobracket: true, format: s => s.replace(/^\.\//, '') }

export const isMatch = (value, pattern) => micromatch.isMatch(value, pattern, OPTS)
