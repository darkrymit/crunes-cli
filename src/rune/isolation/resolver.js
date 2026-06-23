import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import ivm from 'isolated-vm'
import { DENY_BUILTINS } from './builtins.js'
import { isGlobMatch } from '../../shared/match.js'

export function resolvePackageEntry(pkgJson, pkgDir) {
  const exp = pkgJson.exports
  let entry = null

  if (exp) {
    if (typeof exp === 'string') {
      entry = exp
    } else if (exp['.']) {
      const dot = exp['.']
      if (typeof dot === 'string') {
        entry = dot
      } else {
        const val = dot.import ?? dot.node ?? dot.default
        entry = typeof val === 'string' ? val : (val?.default ?? null)
      }
    }
  }

  if (!entry) entry = pkgJson.main ?? 'index.js'
  return path.join(pkgDir, entry)
}

export async function bundleNpmPackage(absEntryPath) {
  const result = await build({
    entryPoints: [absEntryPath],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    metafile: true,
  })

  const bundleText = result.outputFiles[0].text
  const outputKey = Object.keys(result.metafile.outputs)[0]
  const exportedNames = result.metafile.outputs[outputKey].exports

  // ESM package — esbuild already emitted correct named exports
  if (exportedNames.length !== 1 || exportedNames[0] !== 'default') {
    return { bundleText, namedKeys: exportedNames }
  }

  // CJS package — only 'default' in metafile. Probe in throwaway isolate to get keys.
  const wrapperMatch = [...bundleText.matchAll(/var (require_\w+) = __commonJS/g)].pop()
  if (!wrapperMatch) return { bundleText, namedKeys: [] }

  const wrapperName = wrapperMatch[1]
  const probeText = bundleText + `\nconst __k = JSON.stringify(Object.keys(${wrapperName}()));\nexport { __k };`

  let namedKeys = []
  const probeIso = new ivm.Isolate({ memoryLimit: 32 })
  try {
    const probeCtx = await probeIso.createContext()
    const probeMod = await probeIso.compileModule(probeText, { filename: 'probe.js' })
    await probeMod.instantiate(probeCtx, () => { throw new Error('unexpected import') })
    await probeMod.evaluate()
    namedKeys = JSON.parse(await probeMod.namespace.get('__k', { copy: true }))
  } catch { /* probe failed — fall back to default-only */ } finally {
    probeIso.dispose()
  }

  const finalText = bundleText + `\nexport const { ${namedKeys.join(', ')} } = ${wrapperName}();\n`
  return { bundleText: finalText, namedKeys }
}

/**
 * Create an ESM module resolver for use inside an isolated-vm isolate.
 *
 * Priority order (first match wins):
 *   1. Relative / absolute path    → plugin's own files
 *   2. effectiveAllow ∩ pluginDeps → declared npm dep from plugin node_modules
 *   3. DENY_BUILTINS ∪ effectiveDeny → PermissionError with message
 *   4. Zero-trust default          → PermissionError
 */
export function createModuleResolver(isolate, pluginDir, pluginNodeModules, pluginDeps, effectiveAllow, effectiveDeny, projectDir = null, pluginRootDir = null, virtualModules = new Map()) {
  // Cache compiled modules to avoid re-compiling within one isolate lifetime
  const cache = new Map()
  // isolated-vm Module objects expose no .filename property — track it ourselves
  const moduleFilenames = new Map()

  async function compileFile(specifier, absPath) {
    if (cache.has(specifier)) return cache.get(specifier)
    const source = await fs.readFile(absPath, 'utf8')
    const mod = await isolate.compileModule(source, { filename: absPath })
    cache.set(specifier, mod)
    moduleFilenames.set(mod, absPath)
    return mod
  }

  async function compileNpmPackage(specifier, absEntryPath) {
    if (cache.has(specifier)) return cache.get(specifier)
    const { bundleText } = await bundleNpmPackage(absEntryPath)
    const mod = await isolate.compileModule(bundleText, { filename: absEntryPath })
    cache.set(specifier, mod)
    moduleFilenames.set(mod, absEntryPath)
    return mod
  }

  function registerModule(mod, filename) {
    moduleFilenames.set(mod, filename)
  }

  async function moduleResolver(specifier, referrer) {
    // Step 0 — virtual modules: pre-compiled modules registered by the host
    if (virtualModules.has(specifier)) return virtualModules.get(specifier)

    // Step 0 — @plugin/ prefix: plugin runes only; resolves to pluginRootDir/<path>
    if (specifier.startsWith('@plugin/')) {
      if (!pluginRootDir) {
        throw new Error(`PermissionError: '@plugin/' imports are only available in plugin runes`)
      }
      const relPath = specifier.slice('@plugin/'.length)
      const absPath = path.resolve(pluginRootDir, relPath)
      const rel = path.relative(pluginRootDir, absPath)
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`PermissionError: '@plugin/' path '${specifier}' escapes plugin root`)
      }
      return compileFile(specifier, absPath)
    }

    // Step 1 — @project/ prefix: import from project root
    if (specifier.startsWith('@project/')) {
      if (!projectDir) {
        throw new Error(`PermissionError: '@project/' imports require a project context`)
      }
      const relPath = specifier.slice('@project/'.length)
      const absPath = path.resolve(projectDir, relPath)
      const rel = path.relative(projectDir, absPath)
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`PermissionError: '@project/' path '${specifier}' escapes project root`)
      }
      const normalizedRel = './' + rel.replace(/\\/g, '/')
      const token = `fs.read:${normalizedRel}`
      const allowed = isGlobMatch(token, effectiveAllow)
      const denied = effectiveDeny.length > 0 && isGlobMatch(token, effectiveDeny)
      if (!allowed || denied) {
        throw new Error(`PermissionError: '${specifier}' — add 'fs.read:${normalizedRel}' to allow list.`)
      }
      return compileFile(specifier, absPath)
    }

    // Step 1 — relative or absolute path: confined to sandbox boundary
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const referrerFile = referrer ? moduleFilenames.get(referrer) : undefined
      const baseDir = referrerFile ? path.dirname(referrerFile) : pluginDir
      const absPath = path.resolve(baseDir, specifier)

      if (pluginRootDir) {
        const rel = path.relative(pluginRootDir, absPath)
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          throw new Error(`PermissionError: import '${specifier}' escapes plugin root`)
        }
      } else if (projectDir) {
        const rel = path.relative(projectDir, absPath)
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          throw new Error(`PermissionError: import '${specifier}' escapes project directory`)
        }
        const normalizedRel = './' + rel.replace(/\\/g, '/')
        const token = `fs.read:${normalizedRel}`
        const allowed = isGlobMatch(token, effectiveAllow)
        const denied = effectiveDeny.length > 0 && isGlobMatch(token, effectiveDeny)
        if (!allowed || denied) {
          throw new Error(`PermissionError: '${specifier}' — add 'fs.read:${normalizedRel}' to allow list.`)
        }
      } else {
        throw new Error(`PermissionError: relative import '${specifier}' — no sandbox boundary available`)
      }

      return compileFile(absPath, absPath)
    }



    // Step 3 — declared npm dep: must be in effectiveAllow; if pluginDeps is non-null, must also be declared there
    const moduleToken = `module:${specifier}`
    const isAllowed = isGlobMatch(moduleToken, effectiveAllow)
    const isDeclared = pluginDeps === null || Object.prototype.hasOwnProperty.call(pluginDeps, specifier)
    if (isAllowed && isDeclared) {
      const pkgDir = path.join(pluginNodeModules, specifier)
      const pkgJsonPath = path.join(pkgDir, 'package.json')
      let absEntry
      try {
        const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'))
        absEntry = resolvePackageEntry(pkgJson, pkgDir)
      } catch { absEntry = path.join(pkgDir, 'index.js') }
      return compileNpmPackage(specifier, absEntry)
    }

    // Step 4 — deny list (last guard — provides actionable messages for known dangerous modules)
    const builtinMsg = DENY_BUILTINS.get(specifier)
    if (builtinMsg) {
      throw new Error(`PermissionError: '${specifier}' — ${builtinMsg}`)
    }
    const isDenied = effectiveDeny.length > 0 && isGlobMatch(moduleToken, effectiveDeny)
    if (isDenied) {
      throw new Error(`PermissionError: '${specifier}' is explicitly denied.`)
    }

    // Step 5 — zero-trust default
    throw new Error(
      `PermissionError: '${specifier}' is not available.\n` +
      `Add "module:${specifier}" to allow in permissions and "${specifier}" to dependencies.`
    )
  }

  return { resolve: moduleResolver, register: registerModule }
}
