import { readFileSync } from 'node:fs'
import { parseFlags } from '../api/args-parser.js'

const SCHEMA_KEYS = ['positionals', 'options', 'examples', 'commands']
const NODE_KEYS = {
  root: SCHEMA_KEYS,
  command: ['name', 'description', 'to', ...SCHEMA_KEYS],
  positional: ['spec', 'description', 'type', 'choices', 'to'],
  option: ['flags', 'description', 'type', 'default', 'required', 'choices', 'to'],
  example: ['usage', 'description'],
}
const POSITIONAL_SPEC = /^[<[]([a-zA-Z0-9_-]+)(\.\.\.)?[>\]]$/
const VALUE_TYPES = ['string', 'number', 'integer']

/** An args block written as an object of schema fields, rather than { command, permissions }. */
export function isInlineSchema(block) {
  return block != null && typeof block === 'object' && !Array.isArray(block) &&
    Object.keys(block).some(k => SCHEMA_KEYS.includes(k))
}

function fail(where, message) {
  throw new Error(`${where}: ${message}`)
}

function checkKeys(where, node, kind) {
  if (node == null || typeof node !== 'object' || Array.isArray(node)) fail(where, 'must be an object')
  const unknown = Object.keys(node).filter(k => !NODE_KEYS[kind].includes(k))
  if (unknown.length) fail(where, `unknown field${unknown.length > 1 ? 's' : ''} ${unknown.map(k => `"${k}"`).join(', ')} — allowed: ${NODE_KEYS[kind].join(', ')}`)
}

function checkChoices(where, choices) {
  if (choices !== undefined && (!Array.isArray(choices) || choices.length === 0 || choices.some(c => typeof c !== 'string' && typeof c !== 'number'))) {
    fail(where, '"choices" must be a non-empty array of strings or numbers')
  }
}

function checkTo(where, to) {
  if (to !== undefined && typeof to !== 'string' && !(Array.isArray(to) && to.every(t => typeof t === 'string'))) {
    fail(where, '"to" must be a string or an array of strings — the program arguments this one becomes, with {value} for its value')
  }
}

function list(where, node, field) {
  const value = node[field]
  if (value === undefined) return []
  if (!Array.isArray(value)) fail(where, `"${field}" must be an array`)
  return value
}

/**
 * Check a schema written as JSON and convert it to the shape the argument parser and help
 * renderer read — the same shape an args(builder) module produces, where an option's default
 * is held in `def`.
 */
export function normaliseJsonSchema(schema, where = 'args') {
  return normaliseNode(schema, where, 'root')
}

function normaliseNode(node, where, kind) {
  checkKeys(where, node, kind)
  const out = {}
  if (kind === 'command') {
    if (typeof node.name !== 'string' || !node.name) fail(where, '"name" must be a non-empty string')
    out.name = node.name
    out.description = node.description ?? ''
    checkTo(where, node.to)
    if (node.to !== undefined) out.to = node.to
  }
  out.positionals = list(where, node, 'positionals').map((p, i) => {
    const at = `${where}.positionals[${i}]`
    checkKeys(at, p, 'positional')
    if (typeof p.spec !== 'string' || !POSITIONAL_SPEC.test(p.spec)) fail(at, `"spec" must look like <name>, [name] or <names...>`)
    if (p.type !== undefined && !VALUE_TYPES.includes(p.type)) fail(at, `"type" must be one of ${VALUE_TYPES.join(', ')}`)
    checkChoices(at, p.choices)
    checkTo(at, p.to)
    return { spec: p.spec, description: p.description ?? '', ...(p.type && { type: p.type }), ...(p.choices && { choices: p.choices }), ...(p.to !== undefined && { to: p.to }) }
  })
  out.options = list(where, node, 'options').map((o, i) => {
    const at = `${where}.options[${i}]`
    checkKeys(at, o, 'option')
    if (typeof o.flags !== 'string') fail(at, '"flags" must be a string such as "--min <percent>"')
    let flag
    try { flag = parseFlags(o.flags) } catch (err) { fail(at, err.message) }
    if (o.type !== undefined) {
      const takesValue = flag.type !== 'boolean'
      if (takesValue ? !VALUE_TYPES.includes(o.type) : o.type !== 'boolean') {
        fail(at, `"type" must be ${takesValue ? `one of ${VALUE_TYPES.join(', ')} for an option that takes a value` : '"boolean" for a flag that takes no value'}`)
      }
    }
    if (o.required !== undefined && typeof o.required !== 'boolean') fail(at, '"required" must be true or false')
    checkChoices(at, o.choices)
    checkTo(at, o.to)
    return {
      flags: o.flags,
      description: o.description ?? '',
      ...(o.type && o.type !== 'boolean' && { type: o.type }),
      ...(o.default !== undefined && { def: o.default }),
      ...(o.required && { required: true }),
      ...(o.choices && { choices: o.choices }),
      ...(o.to !== undefined && { to: o.to }),
    }
  })
  out.examples = list(where, node, 'examples').map((e, i) => {
    const at = `${where}.examples[${i}]`
    checkKeys(at, e, 'example')
    if (typeof e.usage !== 'string') fail(at, '"usage" must be a string')
    return { usage: e.usage, description: e.description ?? '' }
  })
  out.commands = list(where, node, 'commands').map((c, i) => normaliseNode(c, `${where}.commands[${i}]`, 'command'))
  return out
}

/** Read and normalise a .json schema file. */
export function loadJsonSchema(file, shownAs = file) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`${shownAs}: ${err.code === 'ENOENT' ? 'file not found' : `invalid JSON — ${err.message}`}`)
  }
  return normaliseJsonSchema(parsed, shownAs)
}

/** The command node a parsed call landed on, and every option in force there. */
function nodeFor(schema, commands) {
  let node = schema
  const options = [...(schema.options ?? [])]
  for (const name of commands) {
    node = (node.commands ?? []).find(c => c.name === name) ?? node
    options.push(...(node.options ?? []))
  }
  return { node, options }
}

const shown = value => JSON.stringify(value)

/** Why a value does not have the declared type, or null when it does. */
function typeProblem(type, value) {
  if (type === 'number' && !Number.isFinite(value)) return 'must be a number'
  if (type === 'integer' && !Number.isInteger(value)) return 'must be an integer'
  return null
}

/**
 * Enforce what a schema declares — required positionals and options, and allowed values —
 * against a parsed call. Throws with a message naming the argument and how to see the usage.
 */
export function validateParsed(schema, parsed, key) {
  const { node, options } = nodeFor(schema, parsed.$commands ?? [])
  const usage = `Run \`crunes run ${key}${parsed.$command ? ` ${parsed.$command}` : ''} --help\` for usage.`
  const problems = []

  for (const p of node.positionals ?? []) {
    const [, name, variadic] = p.spec.match(POSITIONAL_SPEC)
    const required = p.spec.startsWith('<')
    const value = parsed[name]
    const values = variadic ? (value ?? []) : (value === undefined ? [] : [value])
    if (required && values.length === 0) problems.push(`missing required ${p.spec}`)
    for (const v of values) {
      const problem = typeProblem(p.type, v)
      if (problem) problems.push(`${p.spec} ${problem} — got ${shown(String(v))}`)
    }
    if (p.choices) {
      for (const v of values) {
        if (!p.choices.map(String).includes(String(v))) problems.push(`${p.spec} must be one of ${p.choices.map(shown).join(', ')} — got ${shown(String(v))}`)
      }
    }
  }

  for (const o of options) {
    const { key: optKey } = parseFlags(o.flags)
    const value = parsed[optKey]
    if (o.required && value === undefined) problems.push(`missing required option ${o.flags}`)
    if (value !== undefined) {
      for (const v of Array.isArray(value) ? value : [value]) {
        const problem = typeProblem(o.type, v)
        if (problem) problems.push(`${o.flags} ${problem}${Number.isNaN(v) ? '' : ` — got ${shown(String(v))}`}`)
      }
    }
    if (o.choices && value !== undefined) {
      const values = Array.isArray(value) ? value : [value]
      for (const v of values) {
        if (!o.choices.map(String).includes(String(v))) problems.push(`${o.flags} must be one of ${o.choices.map(shown).join(', ')} — got ${shown(String(v))}`)
      }
    }
  }

  if (problems.length) throw new Error(`Invalid arguments for "${key}":\n  ${problems.join('\n  ')}\n${usage}`)
}

/** `to` tokens with {value} filled in. */
function expand(to, value) {
  return (Array.isArray(to) ? to : [to]).map(t => value === undefined ? t : t.replaceAll('{value}', String(value)))
}

/** The flag as the program would see it when an option declares no `to`: its long form, else its short one. */
function flagToken(option, key) {
  return /--/.test(option.flags) ? `--${key}` : `-${key}`
}

/**
 * The program arguments a parsed call becomes in mapped mode: the matched command path, then
 * every option in force in declaration order, then the positionals. Each argument becomes its
 * `to` tokens — with {value} filled in — or, without one, its own flag and value. A boolean is
 * passed only when true; an option the caller left unset and that has no default is omitted.
 */
export function mapToArgv(schema, parsed) {
  const tokens = []
  let node = schema
  for (const name of parsed.$commands ?? []) {
    node = (node.commands ?? []).find(c => c.name === name) ?? node
    tokens.push(...expand(node.to ?? name))
  }
  for (const o of nodeFor(schema, parsed.$commands ?? []).options) {
    const { key, type } = parseFlags(o.flags)
    const value = parsed[key]
    if (value === undefined || value === false) continue
    if (type === 'boolean' && !o.type) {
      if (value === true) tokens.push(...(o.to !== undefined ? expand(o.to) : [flagToken(o, key)]))
      continue
    }
    for (const v of Array.isArray(value) ? value : [value]) {
      tokens.push(...(o.to !== undefined ? expand(o.to, v) : [flagToken(o, key), String(v)]))
    }
  }
  for (const p of node.positionals ?? []) {
    const [, name] = p.spec.match(POSITIONAL_SPEC)
    const value = parsed[name]
    if (value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) tokens.push(...(p.to !== undefined ? expand(p.to, v) : [String(v)]))
  }
  return tokens
}

/**
 * What a call passes that the schema does not declare: options it has no flag for, and
 * positionals beyond the declared ones. Tokens after `--` are positionals.
 */
export function undeclaredArgs(schema, parsed, raw) {
  const { options } = nodeFor(schema, parsed.$commands ?? [])
  const long = new Set(['help'])
  const short = new Map([['h', false]]) // short flag → whether it takes a value
  for (const o of options) {
    const { key, alias, type } = parseFlags(o.flags)
    if (/--/.test(o.flags)) long.add(key)
    else short.set(key, type !== 'boolean')
    if (alias) short.set(alias, type !== 'boolean')
    if (type === 'boolean') long.add(`no-${key}`)
  }
  const problems = []
  for (const token of raw) {
    if (token === '--') break
    const longMatch = token.match(/^--([^=]+)/)
    if (longMatch) {
      if (!long.has(longMatch[1])) problems.push(`unknown option --${longMatch[1]}`)
    } else if (/^-[^-\d]/.test(token)) {
      // A cluster such as -vn5: each letter is a flag until one that takes a value, whose value is the rest.
      for (const c of token.slice(1).split('=')[0]) {
        if (!short.has(c)) { problems.push(`unknown option -${c}`); break }
        if (short.get(c)) break
      }
    }
  }
  if (parsed.$rest?.length) problems.push(`unexpected argument${parsed.$rest.length > 1 ? 's' : ''} ${parsed.$rest.map(v => JSON.stringify(String(v))).join(' ')}`)
  return problems
}
