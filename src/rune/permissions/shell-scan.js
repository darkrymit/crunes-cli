/**
 * Fail-closed command-position scanner.
 *
 * Given a command string, returns every position where a program is invoked and
 * every redirect target, or refuses. There is no partial result: a command is
 * either fully classified or denied.
 *
 * Soundness: the scanner sees the exact string the shell will parse. Bash does
 * not re-parse metacharacters introduced by expansion — a variable holding
 * "; rm -rf ~" yields a literal argument after word splitting, not a separator.
 * So expansions cannot manufacture new command positions. The three constructs
 * that can are eval, command substitution, and nested interpreters; substitution
 * is recursed into and the other two are refused.
 */

export class ScanRefusal extends Error {
  constructor(construct, offset) {
    super(`Cannot scan command: ${construct} at offset ${offset} is not supported.`)
    this.name = 'ScanRefusal'
    this.construct = construct
    this.offset = offset
  }
}

const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/

function isOperatorStart(ch) {
  return ch === '|' || ch === '&' || ch === ';' || ch === '\n'
}

/**
 * Tokenize into words and operators. Quoting is resolved here; a word carries
 * both its literal text and whether any part of it was quoted, because an
 * operator character that arrived from inside quotes is not an operator.
 */
function tokenize(src, baseOffset) {
  const tokens = []
  let i = 0
  let buf = ''
  let bufStart = -1
  let hadWord = false

  const flush = () => {
    if (!hadWord) return
    tokens.push({ type: 'word', value: buf, offset: baseOffset + bufStart })
    buf = ''
    bufStart = -1
    hadWord = false
  }
  const begin = at => { if (!hadWord) { hadWord = true; bufStart = at } }

  while (i < src.length) {
    const ch = src[i]

    if (ch === ' ' || ch === '\t') { flush(); i++; continue }

    if (ch === "'") {
      const end = src.indexOf("'", i + 1)
      if (end === -1) throw new ScanRefusal('unterminated single quote', baseOffset + i)
      begin(i)
      buf += src.slice(i + 1, end)
      i = end + 1
      continue
    }

    if (ch === '"') {
      begin(i)
      let j = i + 1
      let inner = ''
      let closed = false
      while (j < src.length) {
        if (src[j] === '\\' && j + 1 < src.length) { inner += src[j + 1]; j += 2; continue }
        if (src[j] === '"') { closed = true; break }
        inner += src[j]
        j++
      }
      if (!closed) throw new ScanRefusal('unterminated double quote', baseOffset + i)
      buf += inner
      i = j + 1
      continue
    }

    if (ch === '\\' && i + 1 < src.length) {
      begin(i)
      buf += src[i + 1]
      i += 2
      continue
    }

    if (isOperatorStart(ch)) {
      flush()
      let op = ch
      if ((ch === '|' && src[i + 1] === '|') || (ch === '&' && src[i + 1] === '&')) op = ch + ch
      tokens.push({ type: 'op', value: op, offset: baseOffset + i })
      i += op.length
      continue
    }

    begin(i)
    buf += ch
    i++
  }
  flush()
  return tokens
}

/** Group a flat token list into command segments split on operators. */
function splitSegments(tokens) {
  const segments = []
  let current = []
  for (const t of tokens) {
    if (t.type === 'op') {
      segments.push(current)
      current = []
      continue
    }
    current.push(t)
  }
  segments.push(current)
  return segments.filter(s => s.length > 0)
}

/** Drop leading FOO=bar assignments; the program is the first non-assignment word. */
function stripAssignments(words) {
  let k = 0
  while (k < words.length && ASSIGNMENT_RE.test(words[k].value)) k++
  return words.slice(k)
}

export function scanCommand(cmd, shellKind = 'bash') {
  const tokens = tokenize(cmd, 0)
  const commands = []
  const redirects = []

  for (const segment of splitSegments(tokens)) {
    const words = stripAssignments(segment)
    if (words.length === 0) continue
    commands.push({
      program: words[0].value,
      args:    words.slice(1).map(w => w.value),
      segment: words.map(w => w.value).join(' '),
      offset:  words[0].offset,
    })
  }

  return { commands, redirects }
}
