import ivm from 'isolated-vm'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawn as spawnProcess } from 'node:child_process'
import { createUtils } from '../api/index.js'
import { getAutoPermits } from '../api/utils.js'
import { createModuleResolver } from './resolver.js'
import { ALLOW_BUILTINS } from './builtins.js'
import { createJob, getJob } from '../../job/index.js'
import { getProjectKey } from '../../project/index.js'
import { hashHex, hashBase64, uuid as cryptoUuid, hex as cryptoHex, base64 as cryptoBase64 } from '../api/crypto.js'
import { computeEffectivePermissions, makePermissionChecker } from '../permissions/permissions.js'
import { isVerbose } from '../../shared/output.js'
import * as EMBEDDED from './embedded.js'
import { parseArgs } from '../api/args-parser.js'

const hostRequire = createRequire(import.meta.url)
const __isolationDir = path.dirname(fileURLToPath(import.meta.url))

// Map from embedded key → source file path (used as fallback in dev/test when EMBEDDED is empty)
const staticModulePaths = {
  md:      path.join(__isolationDir, '../api/md.js'),
  tree:    path.join(__isolationDir, '../api/tree.js'),
  utils:   path.join(__isolationDir, './utils-bootstrap.js'),
  console: path.join(__isolationDir, './console-bootstrap.js'),
}

export function getPluginRunePath(pluginDir, runeKey, pluginJson) {
  const runeRelPath = (pluginJson.runes?.[runeKey])?.path ?? `runes/${runeKey}.js`
  return path.join(pluginDir, runeRelPath)
}

async function compileStaticModule(isolate, key) {
  const src = EMBEDDED[key] || await fs.readFile(staticModulePaths[key], 'utf8')
  return isolate.compileModule(src, { filename: `crunes:${key}` })
}

/**
 * Inject I/O callbacks and utils into the isolate context.
 *
 * md.js and tree.js are compiled as actual ESM isolate modules.
 * utils-bootstrap.js imports them and wires globalThis.utils.
 * All modules come from real files on disk — no eval, no embedded code strings.
 */
const VALID_SIGNALS = new Set(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGUSR1', 'SIGUSR2'])

async function injectUtils(isolate, context, utils, runeCallback, vars, projectDir, checkPermission, currentRuneKey) {
  const jail = context.global

  await jail.set('$__utils_fs_read', new ivm.Reference(async (relPath, opts) => {
    return utils.fs.read(relPath, opts)
  }))
  await jail.set('$__utils_fs_resolve', new ivm.Reference(async (relPath) => {
    return utils.fs.resolve(relPath)
  }))
  await jail.set('$__utils_fs_exists', new ivm.Reference(async (relPath) => {
    return utils.fs.exists(relPath)
  }))
  await jail.set('$__utils_fs_glob', new ivm.Reference(async (pattern, opts) => {
    return utils.fs.glob(pattern, opts)
  }))
  await jail.set('$__utils_fs_write', new ivm.Reference(async (relPath, content) => {
    return utils.fs.write(relPath, content)
  }))
  await jail.set('$__utils_fs_copy', new ivm.Reference(async (src, dest) => {
    await utils.fs.copy(src, dest)
  }))
  const shellHandles = new Map()
  let nextShellHandle = 0

  await jail.set('$__utils_shell_run', new ivm.Reference(async (cmd, opts) => {
    return utils.shell.run(cmd, opts)
  }))
  await jail.set('$__utils_shell_session_open', new ivm.Reference((cmd, opts) => {
    const session = utils.shell.session(cmd, opts)
    const id = String(nextShellHandle++)
    shellHandles.set(id, session)
    return id
  }))
  await jail.set('$__utils_shell_session_write', new ivm.Reference((id, text) => {
    shellHandles.get(id).write(text)
  }))
  await jail.set('$__utils_shell_session_expect', new ivm.Reference(async (id, pattern, timeoutMs) => {
    let pat = pattern
    if (pattern && typeof pattern === 'object' && pattern.type === 'regex') {
      pat = new RegExp(pattern.source, pattern.flags)
    }
    return shellHandles.get(id).expect(pat, timeoutMs)
  }))
  await jail.set('$__utils_shell_session_output', new ivm.Reference((id) => {
    return shellHandles.get(id).output()
  }))
  await jail.set('$__utils_shell_session_waitForExit', new ivm.Reference(async (id) => {
    return shellHandles.get(id).waitForExit()
  }))
  await jail.set('$__utils_shell_session_kill', new ivm.Reference((id) => {
    const handle = shellHandles.get(id)
    if (handle) {
      handle.kill()
      shellHandles.delete(id)
    }
  }))
  await jail.set('$__utils_section_create', new ivm.Reference((name, data, opts) => {
    return utils.section.create(name, data, opts)
  }))
  await jail.set('$__utils_section_match', new ivm.Reference((sectionName, patterns) => {
    return utils.section.match(sectionName, patterns)
  }))
  await jail.set('$__utils_section_selected', new ivm.Reference(() => {
    return utils.section.selected() ?? undefined
  }))
  await jail.set('$__utils_rune', new ivm.Reference(async (key, args) => {
    return runeCallback(key, args || [])
  }))
  await jail.set('$__utils_rune_spawn', new ivm.Reference((key, args) => {
    checkPermission('rune.spawn', key)
    const cliPath = process.argv[1]
    const spawnArgs = ['--cwd', projectDir, 'use', key, ...(args || [])]
    // Pass --no-node-snapshot directly so cli.js skips its spawnSync re-exec,
    // avoiding a second child process that would create a console window on Windows.
    const child = spawnProcess(process.execPath, ['--no-node-snapshot', cliPath, ...spawnArgs], {
      detached:           true,
      stdio:              'ignore',
      windowsHideConsole: true,
      env:                { ...process.env, CRUNES_NO_TIMEOUT: '1' },
    })
    child.unref()
    return createJob(child.pid, { spawnedBy: currentRuneKey, runeKey: key, projectDir, args: args || [] }).then(({ id, projectKey }) => ({ id, projectKey }))
  }))
  const pKey = getProjectKey(projectDir)
  await jail.set('$__utils_rune_kill', new ivm.Reference((id, signal) => {
    const sig = signal ?? 'SIGTERM'
    if (!VALID_SIGNALS.has(sig)) throw new Error(`Invalid signal: ${sig}`)
    return getJob(pKey, id).then(record => {
      if (!record) return
      checkPermission('rune.kill', record.runeKey)
      try { process.kill(record.pid, sig) } catch { /* already gone */ }
    })
  }))
  await jail.set('$__utils_rune_exists', new ivm.Reference((id) => {
    return getJob(pKey, id).then(record => {
      if (!record) return false
      checkPermission('rune.exists', record.runeKey)
      try { process.kill(record.pid, 0); return true } catch { return false }
    })
  }))
  await jail.set('$__utils_time_after', new ivm.Reference((ms) => {
    return new Promise(resolve => setTimeout(resolve, ms))
  }))
  await jail.set('$__utils_json_read', new ivm.Reference(async (relPath, opts) => {
    return utils.json.read(relPath, opts)
  }))
  await jail.set('$__utils_json_get', new ivm.Reference(async (relPath, jsonPath, defaultVal) => {
    return utils.json.get(relPath, jsonPath, defaultVal)
  }))
  await jail.set('$__utils_json_getAll', new ivm.Reference(async (relPath, jsonPath, defaultVal) => {
    return utils.json.getAll(relPath, jsonPath, defaultVal)
  }))
  await jail.set('$__utils_json_write', new ivm.Reference(async (relPath, data, opts) => {
    await utils.json.write(relPath, data, opts)
  }))
  await jail.set('$__utils_yaml_read', new ivm.Reference(async (relPath, opts) => {
    return utils.yaml.read(relPath, opts)
  }))
  await jail.set('$__utils_yaml_write', new ivm.Reference(async (relPath, data, opts) => {
    await utils.yaml.write(relPath, data, opts)
  }))
  await jail.set('$__utils_xml_read', new ivm.Reference(async (relPath, opts) => {
    return utils.xml.read(relPath, opts)
  }))
  await jail.set('$__utils_xml_write', new ivm.Reference(async (relPath, data, opts) => {
    await utils.xml.write(relPath, data, opts)
  }))
  await jail.set('$__utils_fetch', new ivm.Reference(async (url, opts) => {
    const res = await utils.fetch(url, opts)
    return {
      ok:         res.ok,
      status:     res.status,
      statusText: res.statusText,
      headers:    Object.fromEntries(res.headers.entries()),
      _text:      await res.text(),
    }
  }))
  await jail.set('$__utils_env_get', new ivm.Reference(async (key, fallback) => {
    const result = utils.env.get(key, fallback)
    return result !== undefined ? result : null
  }))
  await jail.set('$__utils_env_has', new ivm.Reference(async (key) => {
    return utils.env.has(key)
  }))
  await jail.set('$__utils_archive_unzip', new ivm.Reference(async (source, dest) => {
    await utils.archive.unzip(source, dest)
  }))
  await jail.set('$__utils_archive_zip', new ivm.Reference(async (source, dest) => {
    await utils.archive.zip(source, dest)
  }))
  await jail.set('$__utils_archive_untar', new ivm.Reference(async (source, dest) => {
    await utils.archive.untar(source, dest)
  }))
  await jail.set('$__utils_archive_tar', new ivm.Reference(async (source, dest) => {
    await utils.archive.tar(source, dest)
  }))

  const cacheHandles    = new Map()
  let   nextCacheHandle = 0

  await jail.set('$__utils_cache_open', new ivm.Reference(async (location, name) => {
    const handle = await utils.cache.openHandle(location, name ?? 'default')
    const id = String(nextCacheHandle++)
    cacheHandles.set(id, handle)
    return id
  }))
  await jail.set('$__utils_cache_set', new ivm.Reference(async (id, key, value, ttl) => {
    const handle = cacheHandles.get(id)
    if (!handle) throw new Error(`Invalid cache handle: ${id}`)
    await handle.set(key, value, ttl !== null ? Number(ttl) : null)
  }))
  await jail.set('$__utils_cache_get', new ivm.Reference(async (id, key) => {
    const handle = cacheHandles.get(id)
    if (!handle) throw new Error(`Invalid cache handle: ${id}`)
    const value = await handle.get(key)
    return value !== null ? value : null
  }))
  await jail.set('$__utils_cache_delete', new ivm.Reference(async (id, key) => {
    const handle = cacheHandles.get(id)
    if (!handle) throw new Error(`Invalid cache handle: ${id}`)
    await handle.delete(key)
  }))
  await jail.set('$__utils_cache_clear', new ivm.Reference(async (id) => {
    const handle = cacheHandles.get(id)
    if (!handle) throw new Error(`Invalid cache handle: ${id}`)
    await handle.clear()
  }))

  const sqliteHandles    = new Map()
  let   nextSqliteHandle = 0

  await jail.set('$__utils_sqlite_open', new ivm.Reference(async (location, name) => {
    const handle = await utils.sqlite.openHandle(location, name ?? 'default')
    const id = String(nextSqliteHandle++)
    sqliteHandles.set(id, handle)
    return id
  }))
  await jail.set('$__utils_sqlite_query', new ivm.Reference(async (id, sql, params) => {
    const handle = sqliteHandles.get(id)
    if (!handle) throw new Error(`Invalid sqlite handle: ${id}`)
    return handle.query(sql, params || [])
  }))
  await jail.set('$__utils_sqlite_get', new ivm.Reference(async (id, sql, params) => {
    const handle = sqliteHandles.get(id)
    if (!handle) throw new Error(`Invalid sqlite handle: ${id}`)
    const row = handle.get(sql, params || [])
    return row !== null ? row : null
  }))
  await jail.set('$__utils_sqlite_exec', new ivm.Reference(async (id, sql, params) => {
    const handle = sqliteHandles.get(id)
    if (!handle) throw new Error(`Invalid sqlite handle: ${id}`)
    return handle.exec(sql, params || [])
  }))
  await jail.set('$__utils_sqlite_close', new ivm.Reference(async (id) => {
    const handle = sqliteHandles.get(id)
    if (!handle) return
    handle.close()
    sqliteHandles.delete(id)
  }))

  await jail.set('$__utils_ws_client', new ivm.Reference((url, options) => {
    return utils.ws.createSession(url, options)
  }))
  await jail.set('$__utils_ws_on', new ivm.Reference((sessionIdRef, eventRef, callbackRef) => {
    const sessionId = sessionIdRef.copySync()
    const event = eventRef.copySync()
    utils.ws.getSession(sessionId).setHandler(event, callbackRef)
  }))
  await jail.set('$__utils_ws_open', new ivm.Reference(async (sessionId) => {
    await utils.ws.getSession(sessionId).open()
  }))
  await jail.set('$__utils_ws_send', new ivm.Reference(async (sessionId, message) => {
    await utils.ws.getSession(sessionId).send(message)
  }))
  await jail.set('$__utils_ws_close', new ivm.Reference(async (sessionId) => {
    await utils.ws.getSession(sessionId).close()
  }))

  await jail.set('$__crypto_hash_hex',    new ivm.Reference(hashHex))
  await jail.set('$__crypto_hash_base64', new ivm.Reference(hashBase64))
  await jail.set('$__crypto_uuid',        new ivm.Reference(cryptoUuid))
  await jail.set('$__crypto_hex',         new ivm.Reference(cryptoHex))
  await jail.set('$__crypto_base64',      new ivm.Reference(cryptoBase64))

  await jail.set('$__vars', JSON.stringify(vars))
  await jail.set('$__projectDir', projectDir)

  const [mdMod, treeMod, utilsMod] = await Promise.all([
    compileStaticModule(isolate, 'md'),
    compileStaticModule(isolate, 'tree'),
    compileStaticModule(isolate, 'utils'),
  ])

  const noImports = (spec) => { throw new Error(`Unexpected import in pure util module: ${spec}`) }
  await mdMod.instantiate(context, noImports)
  await treeMod.instantiate(context, noImports)
  await utilsMod.instantiate(context, (spec) => {
    if (spec === 'crunes:md')   return mdMod
    if (spec === 'crunes:tree') return treeMod
    throw new Error(`Unexpected import in utils-bootstrap: ${spec}`)
  })

  await mdMod.evaluate()
  await treeMod.evaluate()
  await utilsMod.evaluate()  // sets globalThis.utils and exports named utils
  return utilsMod
}

async function injectConsole(isolate, context) {
  const jail = context.global
  await jail.set('$__log', new ivm.Reference((...args) => process.stdout.write(args.join(' ') + '\n')))
  await jail.set('$__err', new ivm.Reference((...args) => process.stderr.write(args.join(' ') + '\n')))

  const consoleMod = await compileStaticModule(isolate, 'console')
  await consoleMod.instantiate(context, (spec) => { throw new Error(`Unexpected import in console-bootstrap: ${spec}`) })
  await consoleMod.evaluate()
}

/**
 * Core isolation runner — runs any rune file inside a fresh V8 isolate.
 *
 * @param {string}   runeFile         - absolute path to the rune .js file
 * @param {object}   effective        - { allow: string[], deny: string[] }
 * @param {string[]} args             - rune arguments
 * @param {string}   projectDir       - project root (cwd for the rune)
 * @param {string}   [nodeModulesDir] - node_modules path for import resolution (plugin only)
 * @param {number}   [isolateMemoryMb]
 * @param {number}   [isolateTimeoutMs]
 */
export async function runRuneInIsolate(runeFile, effective, args, projectDir, {
  nodeModulesDir = null,
  pluginDeps = {},
  pluginDir = null,
  runeCallback = null,
  isolateMemoryMb = 128,
  isolateTimeoutMs = process.env.CRUNES_NO_TIMEOUT ? undefined : 30_000,
  sections = null,
  vars = {},
  lifecycle = 'use',
  pluginId = null,
  runeKey = null,
} = {}) {
  const augmented = {
    allow: [...effective.allow, ...getAutoPermits({ pluginId, pluginDir })],
    deny: effective.deny,
  }
  const checkPermission = makePermissionChecker(augmented)
  const { utils, dispose } = createUtils(projectDir, checkPermission, pluginDir ?? null, augmented, vars, sections, pluginId)

  if (isVerbose) console.error(`[crunes:debug] creating Isolate...`)
  const isolate = new ivm.Isolate({ memoryLimit: isolateMemoryMb })
  try {
    if (isVerbose) console.error(`[crunes:debug] creating Context...`)
    const context = await isolate.createContext()

    if (isVerbose) console.error(`[crunes:debug] injecting $__hostRequire...`)
    await context.global.set('$__hostRequire', new ivm.Reference((spec) => {
      if (!ALLOW_BUILTINS.has(spec)) throw new Error(`PermissionError: Sandbox escape blocked. Cannot require '${spec}' on host.`);
      return hostRequire(spec)
    }))

    if (isVerbose) console.error(`[crunes:debug] injecting utils and console...`)
    const utilsMod = await injectUtils(isolate, context, utils, runeCallback, vars, projectDir, checkPermission, runeKey)
    await injectConsole(isolate, context)

    if (pluginDir != null) {
      await context.global.set('CRUNES_PLUGIN_ROOT', pluginDir)
    }

    // Remove $__hostRequire from the global after bootstrap modules are instantiated.
    // Builtin proxy modules call it during their own evaluation (triggered by runeMod.evaluate),
    // so it must stay until then — but must not remain accessible to rune code after that.
    // We delete it via context.eval after evaluate() completes below.

    // Compile the rune module. Conditionally capture the target export into globalThis
    // so context.eval() can call it. The typeof guard prevents ReferenceError when the
    // rune does not export it — the missing-export check below handles that case.
    const runeSrc    = await fs.readFile(runeFile, 'utf8')
    const exportBinding = `\nif (typeof ${lifecycle} !== "undefined") globalThis.__crunes_target = ${lifecycle};\nif (typeof args !== "undefined") globalThis.__crunes_args = args;\n`
    const patchedSrc = runeSrc + exportBinding
    if (isVerbose) console.error(`[crunes:debug] compiling Module...`)
    const runeMod    = await isolate.compileModule(patchedSrc, { filename: runeFile })

    const resolver = createModuleResolver(
      isolate,
      path.dirname(runeFile),
      nodeModulesDir ?? path.join(path.dirname(runeFile), 'node_modules'),
      pluginDeps,
      effective.allow,
      effective.deny,
      projectDir,
      pluginDir ?? null,
      new Map([['@utils', utilsMod]])
    )
    if (isVerbose) console.error(`[crunes:debug] instantiating Module...`)
    await runeMod.instantiate(context, resolver)
    
    if (isVerbose) console.error(`[crunes:debug] evaluating Module...`)
    await runeMod.evaluate(isolateTimeoutMs !== undefined ? { timeout: isolateTimeoutMs } : {})

    // Builtin proxy modules have now been evaluated — remove the host require bridge.
    if (isVerbose) console.error(`[crunes:debug] cleaning up $__hostRequire...`)
    await context.eval('delete globalThis.$__hostRequire')

    // Extract args schema from rune if it exports args(), then parse on host.
    // use(args) always receives a yargs-parser object; args.$raw holds the original array.
    let parsedArgs
    if (await context.eval('typeof __crunes_args !== "undefined"')) {
      const schema = await context.evalClosure(
        `return (async () => {
          const b = (() => {
            const opts = [], pos = [], exs = []
            return {
              option(flags, description, def) { opts.push({ flags, description, def }); return this },
              positional(spec, description)   { pos.push({ spec, description }); return this },
              example(usage, description)     { exs.push({ usage, description }); return this },
              build() { return { options: opts, positionals: pos, examples: exs } }
            }
          })()
          return await __crunes_args(b)
        })()`,
        [],
        isolateTimeoutMs !== undefined ? { timeout: isolateTimeoutMs, result: { promise: true, copy: true } } : { result: { promise: true, copy: true } }
      )
      parsedArgs = parseArgs(args, schema)
    } else {
      parsedArgs = parseArgs(args, null)
    }

    if (!await runeMod.namespace.get(lifecycle, { reference: true })) {
      throw new Error(`Rune "${runeFile}" does not export a ${lifecycle}() function.`)
    }

    // Drive the async target call from inside the isolate.
    // __crunes_target and utils are globals set above.
    // context.eval with { promise: true } correctly awaits the async result.
    if (isVerbose) console.error(`[crunes:debug] extracting ${lifecycle}() result...`)
    const result = await context.evalClosure(
      `return (async () => {
        return await __crunes_target($0);
      })()`,
      [parsedArgs],
      { arguments: { copy: true }, result: { promise: true, copy: true }, timeout: isolateTimeoutMs }
    )

    if (isVerbose) console.error(`[crunes:debug] parsing isolate result...`)
    return result
  } finally {
    if (isVerbose) console.error(`[crunes:debug] disposing Isolate...`)
    dispose()
    isolate.dispose()
  }
}

/**
 * Run a plugin rune in isolation. Resolves the rune file from pluginDir/runes/<runeKey>.js.
 */
export async function runPluginRune(pluginDir, pluginCacheDir, runeKey, pluginJson, effective, args, projectDir, opts = {}) {
  const runeFile       = getPluginRunePath(pluginDir, runeKey, pluginJson)
  const nodeModulesDir = path.join(pluginCacheDir ?? pluginDir, 'node_modules')
  return runRuneInIsolate(runeFile, effective, args, projectDir, {
    nodeModulesDir,
    pluginDeps:       pluginJson.dependencies ?? {},
    pluginDir,
    pluginId:         pluginJson.name && pluginJson.version
                        ? `${pluginJson.name}@${pluginJson.version}`
                        : null,
    runeCallback:     opts.runeCallback ?? null,
    isolateMemoryMb:  opts.isolateMemoryMb,
    isolateTimeoutMs: opts.isolateTimeoutMs,
    sections:         opts.sections ?? null,
    vars:             opts.vars ?? {},
    lifecycle:        opts.lifecycle ?? 'use',
    runeKey,
  })
}

/**
 * Boot a rune in a minimal isolate, call its args() export with an inline builder,
 * and return the JSON schema. Returns null if the rune has no args export.
 */
export async function getArgsSchema(runeFile, effective, projectDir, {
  nodeModulesDir = null,
  pluginDeps = {},
  pluginDir = null,
  isolateMemoryMb = 128,
  isolateTimeoutMs = 30_000,
  vars = {},
} = {}) {
  const augmented = {
    allow: [...effective.allow, ...getAutoPermits({ pluginId: null, pluginDir })],
    deny: effective.deny,
  }
  const checkPermission = makePermissionChecker(augmented)
  const { utils, dispose } = createUtils(projectDir, checkPermission, pluginDir ?? null, augmented, vars, null, null)
  const isolate = new ivm.Isolate({ memoryLimit: isolateMemoryMb })
  try {
    const context = await isolate.createContext()
    await context.global.set('$__hostRequire', new ivm.Reference((spec) => {
      if (!ALLOW_BUILTINS.has(spec)) throw new Error(`PermissionError: Sandbox escape blocked. Cannot require '${spec}' on host.`);
      return hostRequire(spec)
    }))
    const utilsMod = await injectUtils(isolate, context, utils, null, vars, projectDir, checkPermission, null)
    await injectConsole(isolate, context)
    if (pluginDir != null) await context.global.set('CRUNES_PLUGIN_ROOT', pluginDir)

    const runeSrc = await fs.readFile(runeFile, 'utf8')
    const patchedSrc = runeSrc + '\nif (typeof args !== "undefined") globalThis.__crunes_args = args;\n'
    const runeMod = await isolate.compileModule(patchedSrc, { filename: runeFile })
    const resolver = createModuleResolver(
      isolate,
      path.dirname(runeFile),
      nodeModulesDir ?? path.join(path.dirname(runeFile), 'node_modules'),
      pluginDeps,
      effective.allow,
      effective.deny,
      projectDir,
      pluginDir ?? null,
      new Map([['@utils', utilsMod]])
    )
    await runeMod.instantiate(context, resolver)
    await runeMod.evaluate({ timeout: isolateTimeoutMs })
    await context.eval('delete globalThis.$__hostRequire')

    const hasArgsExport = await context.eval('typeof __crunes_args !== "undefined"')
    if (!hasArgsExport) return null

    const schema = await context.evalClosure(
      `return (async () => {
        const b = (() => {
          const opts = [], pos = [], exs = []
          return {
            option(flags, description, def) { opts.push({ flags, description, def }); return this },
            positional(spec, description)   { pos.push({ spec, description }); return this },
            example(usage, description)     { exs.push({ usage, description }); return this },
            build() { return { options: opts, positionals: pos, examples: exs } }
          }
        })()
        return await __crunes_args(b)
      })()`,
      [],
      { timeout: isolateTimeoutMs, result: { promise: true, copy: true } }
    )
    return schema
  } finally {
    dispose()
    isolate.dispose()
  }
}

/**
 * Compute effective permissions and run a plugin rune. Convenience wrapper for core.js.
 */
export async function executePluginRune({ pluginDir, pluginCacheDir, runeKey, pluginJson, projectPerms, projectVars = {}, args, projectDir, opts, runeCallback, sections, lifecycle = 'use', }) {
  const runePerms     = pluginJson.runes[runeKey]?.permissions ?? {}
  const effective     = computeEffectivePermissions(runePerms, projectPerms, lifecycle)
  const runeVars      = pluginJson.runes[runeKey]?.vars ?? {}
  const effectiveVars = { ...runeVars, ...projectVars }
  return runPluginRune(pluginDir, pluginCacheDir, runeKey, pluginJson, effective, args, projectDir, {
    ...opts,
    runeCallback,
    sections,
    vars: effectiveVars,
    lifecycle,
    runeKey,
  })
}
