import ivm from 'isolated-vm'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createUtils } from '../api/index.js'
import { computeEffectivePermissions, makePermissionChecker } from '../permissions/permissions.js'
import { isVerbose } from '../../shared/output.js'
import { createModuleResolver } from './resolver.js'
import * as EMBEDDED from './embedded.js'

const hostRequire = createRequire(import.meta.url)

export function getPluginRunePath(pluginDir, runeKey, pluginJson) {
  const runeRelPath = (pluginJson.runes?.[runeKey])?.path ?? `runes/${runeKey}.js`
  return path.join(pluginDir, runeRelPath)
}

async function compileStaticModule(isolate, key) {
  return isolate.compileModule(EMBEDDED[key], { filename: `crunes:${key}` })
}

/**
 * Inject I/O callbacks and utils into the isolate context.
 *
 * md.js and tree.js are compiled as actual ESM isolate modules.
 * utils-bootstrap.js imports them and wires globalThis.utils.
 * All modules come from real files on disk — no eval, no embedded code strings.
 */
async function injectUtils(isolate, context, utils, runeCallback, vars) {
  const jail = context.global

  await jail.set('$__utils_fs_read', new ivm.Reference(async (relPath, opts) => {
    return utils.fs.read(relPath, opts ? JSON.parse(opts) : undefined)
  }))
  await jail.set('$__utils_fs_exists', new ivm.Reference(async (relPath) => {
    return utils.fs.exists(relPath)
  }))
  await jail.set('$__utils_fs_glob', new ivm.Reference(async (pattern, opts) => {
    const results = await utils.fs.glob(pattern, opts ? JSON.parse(opts) : undefined)
    return JSON.stringify(results)
  }))
  await jail.set('$__utils_fs_write', new ivm.Reference(async (relPath, content) => {
    return utils.fs.write(relPath, content)
  }))
  await jail.set('$__utils_shell', new ivm.Reference(async (cmd, opts) => {
    const result = await utils.shell(cmd, opts ? JSON.parse(opts) : undefined)
    if (typeof result === 'string') return result
    return JSON.stringify(result)
  }))
  await jail.set('$__utils_section_create', new ivm.Reference((name, data, opts) => {
    return JSON.stringify(utils.section.create(name, JSON.parse(data), opts ? JSON.parse(opts) : undefined))
  }))
  await jail.set('$__utils_section_match', new ivm.Reference((sectionName, patternsJson) => {
    const p = patternsJson !== undefined ? JSON.parse(patternsJson) : undefined
    return utils.section.match(sectionName, p)
  }))
  await jail.set('$__utils_section_selected', new ivm.Reference(() => {
    const s = utils.section.selected()
    return s ? JSON.stringify(s) : undefined
  }))
  await jail.set('$__utils_rune', new ivm.Reference(async (key, argsJson) => {
    const sections = await runeCallback(key, argsJson ? JSON.parse(argsJson) : [])
    return JSON.stringify(sections)
  }))
  await jail.set('$__utils_json_read', new ivm.Reference(async (relPath, optsJson) => {
    const result = await utils.json.read(relPath, optsJson ? JSON.parse(optsJson) : undefined)
    return JSON.stringify(result)
  }))
  await jail.set('$__utils_json_get', new ivm.Reference(async (relPath, jsonPath, defaultJson) => {
    const result = await utils.json.get(relPath, jsonPath, defaultJson !== undefined ? JSON.parse(defaultJson) : undefined)
    return JSON.stringify(result)
  }))
  await jail.set('$__utils_json_getAll', new ivm.Reference(async (relPath, jsonPath, defaultJson) => {
    const result = await utils.json.getAll(relPath, jsonPath, defaultJson !== undefined ? JSON.parse(defaultJson) : undefined)
    return JSON.stringify(result)
  }))
  await jail.set('$__utils_json_write', new ivm.Reference(async (relPath, dataJson, optsJson) => {
    await utils.json.write(relPath, JSON.parse(dataJson), optsJson ? JSON.parse(optsJson) : undefined)
  }))
  await jail.set('$__utils_yaml_read', new ivm.Reference(async (relPath, optsJson) => {
    const result = await utils.yaml.read(relPath, optsJson ? JSON.parse(optsJson) : undefined)
    return JSON.stringify(result)
  }))
  await jail.set('$__utils_yaml_write', new ivm.Reference(async (relPath, dataJson, optsJson) => {
    await utils.yaml.write(relPath, JSON.parse(dataJson), optsJson ? JSON.parse(optsJson) : undefined)
  }))
  await jail.set('$__utils_xml_read', new ivm.Reference(async (relPath, optsJson) => {
    const result = await utils.xml.read(relPath, optsJson ? JSON.parse(optsJson) : undefined)
    return JSON.stringify(result)
  }))
  await jail.set('$__utils_xml_write', new ivm.Reference(async (relPath, dataJson, optsJson) => {
    await utils.xml.write(relPath, JSON.parse(dataJson), optsJson ? JSON.parse(optsJson) : undefined)
  }))
  await jail.set('$__utils_fetch', new ivm.Reference(async (url, optsJson) => {
    const res = await utils.fetch(url, optsJson ? JSON.parse(optsJson) : undefined)
    return JSON.stringify({
      ok:         res.ok,
      status:     res.status,
      statusText: res.statusText,
      headers:    res.headers,
      _text:      await res.text(),
    })
  }))
  await jail.set('$__utils_env_get', new ivm.Reference(async (key, fallbackJson) => {
    const result = utils.env.get(key, fallbackJson !== undefined ? JSON.parse(fallbackJson) : undefined)
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
    const handle = utils.cache.openHandle(location, name ?? 'default')
    const id = String(nextCacheHandle++)
    cacheHandles.set(id, handle)
    return id
  }))
  await jail.set('$__utils_cache_set', new ivm.Reference(async (id, key, valueJson, ttl) => {
    const handle = cacheHandles.get(id)
    if (!handle) throw new Error(`Invalid cache handle: ${id}`)
    await handle.set(key, JSON.parse(valueJson), ttl !== null ? Number(ttl) : null)
  }))
  await jail.set('$__utils_cache_get', new ivm.Reference(async (id, key) => {
    const handle = cacheHandles.get(id)
    if (!handle) throw new Error(`Invalid cache handle: ${id}`)
    const value = await handle.get(key)
    return value !== null ? JSON.stringify(value) : null
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
    const handle = utils.sqlite.openHandle(location, name ?? 'default')
    const id = String(nextSqliteHandle++)
    sqliteHandles.set(id, handle)
    return id
  }))
  await jail.set('$__utils_sqlite_query', new ivm.Reference(async (id, sql, paramsJson) => {
    const handle = sqliteHandles.get(id)
    if (!handle) throw new Error(`Invalid sqlite handle: ${id}`)
    return JSON.stringify(handle.query(sql, paramsJson ? JSON.parse(paramsJson) : []))
  }))
  await jail.set('$__utils_sqlite_get', new ivm.Reference(async (id, sql, paramsJson) => {
    const handle = sqliteHandles.get(id)
    if (!handle) throw new Error(`Invalid sqlite handle: ${id}`)
    const row = handle.get(sql, paramsJson ? JSON.parse(paramsJson) : [])
    return row !== null ? JSON.stringify(row) : null
  }))
  await jail.set('$__utils_sqlite_exec', new ivm.Reference(async (id, sql, paramsJson) => {
    const handle = sqliteHandles.get(id)
    if (!handle) throw new Error(`Invalid sqlite handle: ${id}`)
    return JSON.stringify(handle.exec(sql, paramsJson ? JSON.parse(paramsJson) : []))
  }))
  await jail.set('$__utils_sqlite_close', new ivm.Reference(async (id) => {
    const handle = sqliteHandles.get(id)
    if (!handle) return
    handle.close()
    sqliteHandles.delete(id)
  }))

  await jail.set('$__vars', JSON.stringify(vars))

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
  await utilsMod.evaluate()  // sets globalThis.utils
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
  isolateTimeoutMs = 30_000,
  sections = null,
  vars = {},
  lifecycle = 'use',
  pluginId = null,
} = {}) {
  const augmented = pluginDir
    ? { allow: [...effective.allow, 'fs.read:@plugin/**'], deny: effective.deny }
    : effective
  const checkPermission = makePermissionChecker(augmented)
  const { utils, dispose } = createUtils(projectDir, checkPermission, pluginDir ?? null, augmented, vars, sections, pluginId)

  if (isVerbose) console.error(`[crunes:debug] creating Isolate...`)
  const isolate = new ivm.Isolate({ memoryLimit: isolateMemoryMb })
  try {
    if (isVerbose) console.error(`[crunes:debug] creating Context...`)
    const context = await isolate.createContext()

    if (isVerbose) console.error(`[crunes:debug] injecting $__hostRequire...`)
    await context.global.set('$__hostRequire', new ivm.Reference((spec) => hostRequire(spec)))

    if (isVerbose) console.error(`[crunes:debug] injecting utils and console...`)
    await injectUtils(isolate, context, utils, runeCallback, vars)
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
    const exportBinding = `\nif (typeof ${lifecycle} !== "undefined") globalThis.__crunes_target = ${lifecycle};\n`
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
    )
    if (isVerbose) console.error(`[crunes:debug] instantiating Module...`)
    await runeMod.instantiate(context, resolver)
    
    if (isVerbose) console.error(`[crunes:debug] evaluating Module...`)
    await runeMod.evaluate({ timeout: isolateTimeoutMs })

    // Builtin proxy modules have now been evaluated — remove the host require bridge.
    if (isVerbose) console.error(`[crunes:debug] cleaning up $__hostRequire...`)
    await context.eval('delete globalThis.$__hostRequire')

    if (!await runeMod.namespace.get(lifecycle, { reference: true })) {
      throw new Error(`Rune "${runeFile}" does not export a ${lifecycle}() function.`)
    }

    // Drive the async target call from inside the isolate.
    // __crunes_target and utils are globals set above.
    // context.eval with { promise: true } correctly awaits the async result.
    if (isVerbose) console.error(`[crunes:debug] extracting ${lifecycle}() result...`)
    const resultJson = await context.eval(
      `(async () => {
        const r = await __crunes_target(
          ${JSON.stringify(projectDir)},
          ${JSON.stringify(args)},
          utils
        );
        return JSON.stringify(r);
      })()`,
      { promise: true, timeout: isolateTimeoutMs }
    )

    if (isVerbose) console.error(`[crunes:debug] parsing isolate result...`)
    return JSON.parse(resultJson)
  } finally {
    if (isVerbose) console.error(`[crunes:debug] disposing Isolate...`)
    dispose()
    isolate.dispose()
  }
}

/**
 * Run a plugin rune in isolation. Resolves the rune file from pluginDir/runes/<runeKey>.js.
 */
export async function runPluginRune(pluginDir, runeKey, pluginJson, effective, args, projectDir, opts = {}) {
  const runeFile       = getPluginRunePath(pluginDir, runeKey, pluginJson)
  const nodeModulesDir = path.join(pluginDir, 'node_modules')
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
  })
}

/**
 * Compute effective permissions and run a plugin rune. Convenience wrapper for core.js.
 */
export async function executePluginRune({ pluginDir, runeKey, pluginJson, projectPerms, projectVars = {}, args, projectDir, opts, runeCallback, sections, lifecycle = 'use' }) {
  const runePerms     = pluginJson.runes[runeKey]?.permissions ?? {}
  const effective     = computeEffectivePermissions(runePerms, projectPerms, lifecycle)
  const runeVars      = pluginJson.runes[runeKey]?.vars ?? {}
  const effectiveVars = { ...runeVars, ...projectVars }
  return runPluginRune(pluginDir, runeKey, pluginJson, effective, args, projectDir, {
    ...opts,
    runeCallback,
    sections,
    vars: effectiveVars,
    lifecycle,
  })
}
