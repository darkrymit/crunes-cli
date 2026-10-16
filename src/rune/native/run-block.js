import { isAbsolute, join, relative } from 'node:path'
import { runRuneInIsolate, getArgsSchema } from '../isolation/runner.js'
import { computeEffectivePermissions } from '../permissions/permissions.js'
import { parseArgs } from '../api/args-parser.js'
import { formatRuneIndex, formatCommandPage, selectNode } from '../../docs/help-render.js'
import { renderSection } from '../../shared/render.js'
import { isGlobMatch } from '../../shared/match.js'
import { getLocalBase } from '../../store/index.js'
import { isPathCommand, runtimeOf, resolveInterpreter, assertNotMissedRename } from './runtime.js'
import { spawnNative } from './spawn.js'
import { isInlineSchema, normaliseJsonSchema, loadJsonSchema, validateParsed, mapToArgv, undeclaredArgs } from './schema.js'

/** A block written as a string is shorthand for { command }. */
export function normaliseBlock(block) {
  if (block == null) return null
  return typeof block === 'string' ? { command: block } : block
}

/** A path command resolves against the config directory; a bare program name is left for PATH. */
export function resolveCommand(command, configDir) {
  return isPathCommand(command) && !isAbsolute(command) ? join(configDir, command) : command
}

/** Flat block grants ({ allow, deny }) in the lifecycle-scoped shape the permission engine reads. */
function blockGrants(block, lifecycle = 'run') {
  return computeEffectivePermissions({ [lifecycle]: block?.permissions ?? {} }, undefined, lifecycle)
}

/** Everything a caller needs to know about how a run-block rune executes. */
export function describeRunBlock(entry, configDir) {
  const run = normaliseBlock(entry.run)
  const inline = isInlineSchema(entry.args) ? entry.args : null
  const args = inline ? null : normaliseBlock(entry.args)
  const command = resolveCommand(run.command, configDir)
  // An args handler is always a file — a schema module or a .json schema — never a program.
  const argsFile = args ? (isAbsolute(args.command) ? args.command : join(configDir, args.command)) : null
  return {
    command,
    argv: run.argv ?? [],
    runtime: runtimeOf(command),
    output: run.output ?? 'text',
    pass: run.pass ?? 'raw',
    timeout: run.timeout ?? null,
    permissions: run.permissions,
    argsInline: inline,
    argsModule: argsFile,
    argsPermissions: args?.permissions,
  }
}

/**
 * The schema a native run block is documented and parsed with, or null without an args block:
 * written inline, read from a .json file, or built by a *.rune.js module in the isolate.
 */
export async function getRunBlockSchema(desc, projectDir, { vars = {}, runeKey = null } = {}) {
  if (desc.argsInline) return normaliseJsonSchema(desc.argsInline, `runes["${runeKey}"].args`)
  if (!desc.argsModule) return null
  if (/\.json$/i.test(desc.argsModule)) {
    return loadJsonSchema(desc.argsModule, relative(projectDir, desc.argsModule).replace(/\\/g, '/') || desc.argsModule)
  }
  return getArgsSchema(desc.argsModule, blockGrants({ permissions: desc.argsPermissions }), projectDir, { vars, runeKey })
}

/**
 * A line of structured output: a section event in the shape crunes prints with --format jsonl,
 * a log event, or anything else — which is plain text.
 */
export function parseOutputLine(line) {
  if (!line.startsWith('{')) return { text: line }
  let event
  try { event = JSON.parse(line) } catch { return { text: line } }
  const sec = event?.section
  if (event?.type === 'section' && sec && typeof sec.name === 'string' && sec.data && typeof sec.data === 'object') {
    return { section: { name: sec.name, ...(sec.title && { title: sec.title }), attrs: sec.attrs ?? {}, data: sec.data } }
  }
  if (event?.type === 'log' && typeof event.message === 'string') return { log: event }
  return { text: line }
}

function helpText(schema, parsed, key) {
  const commands = parsed.$commands ?? []
  if (commands.length > 0) {
    const sel = selectNode(schema, commands)
    if (sel.node) return formatCommandPage(sel.node, { key, lifecycle: 'run', path: sel.matchedPath })
  }
  return formatRuneIndex(schema, { key, lifecycle: 'run', includeBatch: false })
}

function wantsHelp(rawArgs) {
  const end = rawArgs.indexOf('--')
  return (end === -1 ? rawArgs : rawArgs.slice(0, end)).includes('--help')
}

/**
 * Run a rune declared with a run block.
 *
 * An isolate module runs exactly as a path rune does. A native handler is spawned:
 * directly when opts.direct (the single-invocation case), captured otherwise.
 * Returns the isolate's result, { directExitCode } for a direct native run, or a string
 * (the captured standard output, or help text) for a captured one.
 */
export async function runRunBlock({ dir, key, args, entry, opts = {}, configDir, runeCallback, instanceId }) {
  const desc = describeRunBlock(entry, configDir)
  let callArgs = [...desc.argv, ...args]

  if (desc.runtime === 'isolate') {
    return runRuneInIsolate(desc.command, blockGrants(desc), callArgs, dir, {
      runeCallback,
      sections: opts.sections ?? null,
      vars: entry.vars ?? {},
      lifecycle: 'run',
      runeKey: key,
      onEvent: opts.onEvent ?? null,
      instanceId,
      nodeModulesDir: join(getLocalBase(configDir), 'node_modules'),
      pluginDeps: null,
      ...(desc.timeout != null && { isolateTimeoutMs: desc.timeout * 1000 }),
    })
  }

  const direct = opts.direct === true
  const structured = desc.output === 'sections'
  if (direct && opts.sections && !structured) {
    throw new Error(
      `A section filter cannot apply to "${key}": it is a script rune run on its own, so crunes does not capture its output. ` +
      `Run it in a batch (-b) or with --format jsonl to filter its result.`
    )
  }

  assertNotMissedRename(desc.command, desc.runtime, dir)

  const schema = await getRunBlockSchema(desc, dir, { vars: entry.vars ?? {}, runeKey: key })
  let parsed = null
  if (schema) {
    parsed = parseArgs(args, schema)
    if (wantsHelp(args)) {
      const text = helpText(schema, parsed, key)
      if (!direct) return text
      process.stdout.write(text + '\n')
      return { directExitCode: 0 }
    }
    validateParsed(schema, parsed, key)
    // Mapped: the schema is the rune's whole surface. Nothing it does not declare reaches the
    // program, and what it does declare is rewritten into the program's own arguments.
    if (desc.pass === 'mapped') {
      const undeclared = undeclaredArgs(schema, parsed, args)
      if (undeclared.length) {
        throw new Error(`Invalid arguments for "${key}":\n  ${undeclared.join('\n  ')}\nRun \`crunes run ${key} --help\` for usage.`)
      }
      callArgs = [...desc.argv, ...mapToArgv(schema, parsed)]
    }
  }

  const interpreter = resolveInterpreter(desc.runtime, dir)
  const argv = interpreter
    ? [interpreter.command, ...interpreter.args, desc.command, ...callArgs]
    : [desc.command, ...callArgs]

  const env = {
    ...process.env,
    CRUNES_PROJECT_ROOT: dir,
    CRUNES_RUNE_KEY: key,
    CRUNES_LIFECYCLE: 'run',
    ...(parsed ? { CRUNES_ARGS: JSON.stringify(parsed) } : {}),
    CRUNES_VARS: JSON.stringify(entry.vars ?? {}),
  }

  const shown = isPathCommand(desc.command) ? relative(dir, desc.command) || desc.command : desc.command
  const spawnOpts = { key, file: shown, argv, env, cwd: dir, direct, stdin: opts.stdin ?? 'inherit', timeoutMs: desc.timeout != null ? desc.timeout * 1000 : null }

  if (!structured) {
    const result = await spawnNative(spawnOpts)
    return direct ? { directExitCode: result.exitCode } : result.stdout
  }

  // Structured output: each section line becomes a section as soon as it is printed;
  // any other line is plain text, kept in order around them.
  const sections = []
  const text = []
  const wanted = sec => !opts.sections || isGlobMatch(sec.name, opts.sections)
  const onLine = line => {
    const parsedLine = parseOutputLine(line)
    if (parsedLine.log) {
      process.stderr.write(`${parsedLine.log.message}\n`)
    } else if (parsedLine.section) {
      if (direct) {
        if (wanted(parsedLine.section)) process.stdout.write(renderSection(parsedLine.section) + '\n\n')
      } else {
        sections.push(parsedLine.section)
        opts.onEvent?.({ type: 'section', section: parsedLine.section, instanceId, rune: key })
      }
    } else if (direct) {
      process.stdout.write(parsedLine.text + '\n')
    } else {
      text.push(parsedLine.text)
    }
  }
  const result = await spawnNative({ ...spawnOpts, onLine })
  if (direct) return { directExitCode: result.exitCode }
  const plain = text.join('\n').replace(/\n+$/, '')
  return plain ? [...sections, plain] : sections
}
