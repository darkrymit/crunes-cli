import micromatch from 'micromatch'

const OPTS = { dot: true, noextglob: true, nonegate: true, nobrace: true, nobracket: true }

export const isMatch = (value, pattern) => micromatch.isMatch(value, pattern, OPTS)
