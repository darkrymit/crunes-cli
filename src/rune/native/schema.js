import { readFileSync } from 'node:fs'
import { parseFlags } from '../api/args-parser.js'

const SCHEMA_KEYS = ['positionals', 'options', 'examples', 'commands']
const NODE_KEYS = {
  root: SCHEMA_KEYS,
  command: ['name', 'description', ...SCHEMA_KEYS],
  positional: ['spec', 'description', 'choices'],
  option: ['flags', 'description', 'default', 'required', 'choices'],
  example: ['usage', 'description'],
}
const POSITIONAL_SPEC = /^[<[]([a-zA-Z0-9_-]+)(\.\.\.)?[>\]]$/

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
  }
  out.positionals = list(where, node, 'positionals').map((p, i) => {
    const at = `${where}.positionals[${i}]`
    checkKeys(at, p, 'positional')
    if (typeof p.spec !== 'string' || !POSITIONAL_SPEC.test(p.spec)) fail(at, `"spec" must look like <name>, [name] or <names...>`)
    checkChoices(at, p.choices)
    return { spec: p.spec, description: p.description ?? '', ...(p.choices && { choices: p.choices }) }
  })
  out.options = list(where, node, 'options').map((o, i) => {
    const at = `${where}.options[${i}]`
    checkKeys(at, o, 'option')
    if (typeof o.flags !== 'string') fail(at, '"flags" must be a string such as "--min <percent>"')
    try { parseFlags(o.flags) } catch (err) { fail(at, err.message) }
    if (o.required !== undefined && typeof o.required !== 'boolean') fail(at, '"required" must be true or false')
    checkChoices(at, o.choices)
    return {
      flags: o.flags,
      description: o.description ?? '',
      ...(o.default !== undefined && { def: o.default }),
      ...(o.required && { required: true }),
      ...(o.choices && { choices: o.choices }),
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
    if (o.choices && value !== undefined) {
      const values = Array.isArray(value) ? value : [value]
      for (const v of values) {
        if (!o.choices.map(String).includes(String(v))) problems.push(`${o.flags} must be one of ${o.choices.map(shown).join(', ')} — got ${shown(String(v))}`)
      }
    }
  }

  if (problems.length) throw new Error(`Invalid arguments for "${key}":\n  ${problems.join('\n  ')}\n${usage}`)
}
