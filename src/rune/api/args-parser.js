import yargsParser from 'yargs-parser'

const FLAG_SHORT = /^-([a-zA-Z])$/
const FLAG_LONG  = /^--([a-zA-Z][a-zA-Z0-9-]*)(?:\s+<([a-zA-Z0-9_-]+)>|\s+\[([a-zA-Z0-9_-]+)\])?$/

export function parseFlags(flagStr) {
  const parts = flagStr.split(',').map(s => s.trim())
  let short = undefined
  let long  = null
  let type  = 'boolean'

  for (const part of parts) {
    const sm = part.match(FLAG_SHORT)
    if (sm) { short = sm[1]; continue }
    const lm = part.match(FLAG_LONG)
    if (lm) {
      long = lm[1]
      if (lm[2] || lm[3]) {
        const t = (lm[2] || lm[3]).toLowerCase()
        type = t === 'number' ? 'number' : 'string'
      }
    }
  }

  const key = long ?? short
  if (!key) throw new Error(`invalid flag spec "${flagStr}"`)
  return { key, alias: short, type }
}

export function buildYargsConfig(schema) {
  if (!schema) return {}
  const cfg = { alias: {}, boolean: [], number: [], string: [], default: {} }
  for (const opt of schema.options ?? []) {
    const { key, alias, type } = parseFlags(opt.flags)
    if (alias) cfg.alias[alias] = key
    if (type === 'boolean') cfg.boolean.push(key)
    else if (type === 'number') cfg.number.push(key)
    else cfg.string.push(key)
    if (opt.def !== undefined) cfg.default[key] = opt.def
  }
  return cfg
}

export function mapPositionals(parsed, positionals, offset = 0) {
  let consumedCount = 0
  parsed.$rest = []

  if (positionals && positionals.length > 0) {
    for (let i = 0; i < positionals.length; i++) {
      const spec = positionals[i].spec
      
      // 1. Check for variadic positional spec: e.g. <targets...> or [targets...]
      const varMatch = spec.match(/^[<\[]([a-zA-Z0-9_-]+)\.\.\.[>\]]$/)
      if (varMatch) {
        const key = varMatch[1]
        parsed[key] = parsed._.slice(i + offset)
        consumedCount = parsed._.length // Consumes all remaining positionals
        break
      }
      
      // 2. Standard positional spec: e.g. <name> or [name]
      const match = spec.match(/^[<\[]([a-zA-Z0-9_-]+)[>\]]$/)
      if (match) {
        const key = match[1]
        const val = parsed._[i + offset]
        if (val !== undefined) {
          parsed[key] = val
          consumedCount = i + 1
        }
      }
    }
  }

  // 3. Any unconsumed positionals go to $rest
  parsed.$rest = parsed._.slice(offset + consumedCount)
}

export function parseArgs(rawArgs, schema) {
  if (!schema) {
    const parsed = yargsParser(rawArgs, {})
    parsed.$raw = rawArgs
    return parsed
  }

  // 1. Recursive Command Resolution
  let currentSchema = schema
  const commandsMatched = []

  while (true) {
    // Accumulate all options configured from the root down to the current matched path
    const activeOptions = new Map()
    for (const opt of schema.options ?? []) {
      activeOptions.set(opt.flags, opt)
    }
    let temp = schema
    for (const name of commandsMatched) {
      temp = temp.commands.find(c => c.name === name)
      for (const opt of temp.options ?? []) {
        activeOptions.set(opt.flags, opt)
      }
    }

    const rootCfg = buildYargsConfig({ options: Array.from(activeOptions.values()) })
    const tempParsed = yargsParser(rawArgs, rootCfg)
    const nextPosIndex = commandsMatched.length
    const nextArg = tempParsed._[nextPosIndex]

    if (nextArg && currentSchema.commands) {
      const match = currentSchema.commands.find(c => c.name === nextArg)
      if (match) {
        commandsMatched.push(nextArg)
        currentSchema = match
        continue
      }
    }
    break
  }

  // 2. Merge Option Hierarchies
  const optionsMap = new Map()
  for (const opt of schema.options ?? []) {
    optionsMap.set(opt.flags, opt)
  }

  let temp = schema
  for (const name of commandsMatched) {
    temp = temp.commands.find(c => c.name === name)
    for (const opt of temp.options ?? []) {
      optionsMap.set(opt.flags, opt) // child options override parent conflicts
    }
  }

  const finalSchema = { options: Array.from(optionsMap.values()) }
  const finalCfg = buildYargsConfig(finalSchema)
  const parsed = yargsParser(rawArgs, finalCfg)
  
  parsed.$raw = rawArgs

  // 3. Expose Unified Command Properties
  if (commandsMatched.length > 0) {
    parsed.$command = commandsMatched.join(' ')
    parsed.$commands = commandsMatched
  }

  // 4. Strip command tokens from args._ so it contains only data positionals
  parsed._ = parsed._.slice(commandsMatched.length)

  // 5. Map Named Positional Parameters (offset is now 0 since _ is already sliced)
  mapPositionals(parsed, currentSchema.positionals, 0)

  return parsed
}

