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

const CONTROL_KEYWORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi',
  'while', 'until', 'do', 'done',
  'for', 'select', 'case', 'esac', 'function',
])

const NESTED_INTERPRETERS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh'])

// cmd.exe has a different grammar (^ escaping, %VAR% expansion, & as an
// unconditional separator). Rather than approximate a second grammar inside a
// security boundary, cmd mode accepts only a single metacharacter-free command.
const CMD_METACHARACTERS = /[&|<>^%()]/

function guardCmdMode(cmd) {
  const m = CMD_METACHARACTERS.exec(cmd)
  if (m) throw new ScanRefusal('cmd metacharacter', m.index)
}

/** Index of the closing delimiter matching an opener, honouring nesting and quotes. */
function matchDelimiter(src, from, open, close) {
  let depth = 1
  let i = from
  while (i < src.length) {
    const ch = src[i]
    if (ch === '\\') { i += 2; continue }
    if (ch === "'") { const e = src.indexOf("'", i + 1); if (e === -1) return -1; i = e + 1; continue }
    if (ch === '"') { const e = src.indexOf('"', i + 1); if (e === -1) return -1; i = e + 1; continue }
    if (ch === open) depth++
    else if (ch === close) { depth--; if (depth === 0) return i }
    i++
  }
  return -1
}

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
      if (inner.includes('$(') || inner.includes('`')) {
        // Substitution stays active inside double quotes.
        const nested = tokenize(inner, baseOffset + i + 1)
        for (const t of nested) {
          if (t.type === 'subst') tokens.push({ ...t, inCommandPosition: false })
        }
        buf += inner.replace(/\$\([^)]*\)|`[^`]*`/g, '')
      } else {
        buf += inner
      }
      i = j + 1
      continue
    }

    if (ch === '\\' && i + 1 < src.length) {
      begin(i)
      buf += src[i + 1]
      i += 2
      continue
    }

    if (ch === '$' && src[i + 1] === '(' && src[i + 2] === '(') {
      throw new ScanRefusal('arithmetic expansion', baseOffset + i)
    }

    if (ch === '<' && src[i + 1] === '<') {
      throw new ScanRefusal('heredoc', baseOffset + i)
    }

    if ((ch === '<' || ch === '>') && src[i + 1] === '(') {
      throw new ScanRefusal('process substitution', baseOffset + i)
    }

    if (ch === '$' && src[i + 1] === '(') {
      const end = matchDelimiter(src, i + 2, '(', ')')
      if (end === -1) throw new ScanRefusal('unterminated command substitution', baseOffset + i)
      const wasInCommandPosition = !hadWord
      flush()
      tokens.push({ type: 'subst', src: src.slice(i + 2, end), offset: baseOffset + i + 2, inCommandPosition: wasInCommandPosition })
      i = end + 1
      continue
    }

    if (ch === '`') {
      const end = src.indexOf('`', i + 1)
      if (end === -1) throw new ScanRefusal('unterminated command substitution', baseOffset + i)
      const wasInCommandPosition = !hadWord
      flush()
      tokens.push({ type: 'subst', src: src.slice(i + 1, end), offset: baseOffset + i + 1, inCommandPosition: wasInCommandPosition })
      i = end + 1
      continue
    }

    if (ch === '(' && !hadWord) {
      const end = matchDelimiter(src, i + 1, '(', ')')
      if (end === -1) throw new ScanRefusal('unterminated subshell', baseOffset + i)
      flush()
      tokens.push({ type: 'group', src: src.slice(i + 1, end), offset: baseOffset + i + 1 })
      i = end + 1
      continue
    }

    if (ch === '>' || ch === '<' || (ch === '&' && src[i + 1] === '>')) {
      // A bare digit word directly preceding '>' is an fd number, not an argument.
      let opLen = 1
      let mode = ch === '<' ? 'read' : 'write'
      if (ch === '&') { opLen = 2; mode = 'write' }
      else if (src[i + 1] === '>' || src[i + 1] === '|') opLen = 2
      if (hadWord && /^\d+$/.test(buf) && (ch === '>' || ch === '<')) {
        buf = ''
        hadWord = false
        bufStart = -1
      } else {
        flush()
      }
      tokens.push({ type: 'redirect', mode, offset: baseOffset + i })
      i += opLen
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
  if (shellKind === 'cmd') guardCmdMode(cmd)

  const commands = []
  const redirects = []
  collect(tokenize(cmd, 0), commands, redirects)
  return { commands, redirects }
}

function collect(tokens, commands, redirects) {
  for (const segment of splitSegments(tokens)) {
    // Recurse first so nested commands are reported in source order.
    const words = []
    for (let k = 0; k < segment.length; k++) {
      const t = segment[k]

      if (t.type === 'subst' || t.type === 'group') {
        if (t.type === 'subst' && t.inCommandPosition && words.length === 0) {
          throw new ScanRefusal('substitution in command position', t.offset)
        }
        collect(tokenize(t.src, t.offset), commands, redirects)
        continue
      }

      if (t.type === 'redirect') {
        const target = segment[k + 1]
        if (!target || target.type !== 'word') throw new ScanRefusal('redirect without target', t.offset)
        if (target.value.startsWith('$')) throw new ScanRefusal('variable redirect target', target.offset)
        redirects.push({ mode: t.mode, target: target.value, offset: target.offset })
        k++
        continue
      }

      words.push(t)
    }

    const real = stripAssignments(words)
    if (real.length === 0) continue

    const program = real[0].value
    const args = real.slice(1).map(w => w.value)

    if (program.startsWith('$')) throw new ScanRefusal('variable in command position', real[0].offset)
    if (CONTROL_KEYWORDS.has(program)) throw new ScanRefusal('control structure', real[0].offset)
    if (program === 'eval') throw new ScanRefusal('eval', real[0].offset)
    if (program === 'xargs') throw new ScanRefusal('xargs', real[0].offset)
    if (NESTED_INTERPRETERS.has(program) && args.includes('-c')) {
      throw new ScanRefusal('nested interpreter', real[0].offset)
    }
    if (program === 'find' && args.some(a => a === '-exec' || a === '-execdir' || a === '-ok')) {
      throw new ScanRefusal('find -exec', real[0].offset)
    }

    commands.push({ program, args, segment: [program, ...args].join(' '), offset: real[0].offset })
  }
}
