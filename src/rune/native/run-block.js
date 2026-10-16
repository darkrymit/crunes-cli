import { isAbsolute, join, relative } from 'node:path'
import { runRuneInIsolate, getArgsSchema } from '../isolation/runner.js'
import { computeEffectivePermissions } from '../permissions/permissions.js'
import { parseArgs } from '../api/args-parser.js'
import { formatRuneIndex, formatCommandPage, selectNode } from '../../docs/help-render.js'
import { getLocalBase } from '../../store/index.js'
import { isPathCommand, runtimeOf, resolveInterpreter, assertNotMissedRename } from './runtime.js'
import { spawnNative } from './spawn.js'

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
  const args = normaliseBlock(entry.args)
  const command = resolveCommand(run.command, configDir)
  return {
    command,
    argv: run.argv ?? [],
    runtime: runtimeOf(command),
    permissions: run.permissions,
    argsModule: args ? resolveCommand(args.command, configDir) : null,
    argsPermissions: args?.permissions,
  }
}

/** The schema a native run block is documented and parsed with, or null without an args block. */
export async function getRunBlockSchema(desc, projectDir, { vars = {}, runeKey = null } = {}) {
  if (!desc.argsModule) return null
  return getArgsSchema(desc.argsModule, blockGrants({ permissions: desc.argsPermissions }), projectDir, { vars, runeKey })
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
  const callArgs = [...desc.argv, ...args]

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
    })
  }

  const direct = opts.direct === true
  if (direct && opts.sections) {
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
  }

  const shown = isPathCommand(desc.command) ? relative(dir, desc.command) || desc.command : desc.command
  const result = await spawnNative({ key, file: shown, argv, env, cwd: dir, direct, stdin: opts.stdin ?? 'inherit' })
  return direct ? { directExitCode: result.exitCode } : result.stdout
}
