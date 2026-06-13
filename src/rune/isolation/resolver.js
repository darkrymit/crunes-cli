import fs from 'node:fs/promises'
import path from 'node:path'
import { DENY_BUILTINS } from './builtins.js'
import { isMatch } from '../../shared/match.js'

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
      const allowed = isMatch(token, effectiveAllow)
      const denied = effectiveDeny.length > 0 && isMatch(token, effectiveDeny)
      if (!allowed || denied) {
        throw new Error(`PermissionError: '${specifier}' — add 'fs.read:${normalizedRel}' to allow list.`)
      }
      return compileFile(specifier, absPath)
    }

    // Step 1 — relative or absolute path: plugin's own files
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const referrerFile = referrer ? moduleFilenames.get(referrer) : undefined
      const baseDir = referrerFile ? path.dirname(referrerFile) : pluginDir
      const absPath = path.resolve(baseDir, specifier)
      return compileFile(absPath, absPath) // Use absPath as cache key instead of specifier
    }



    // Step 3 — declared npm dep: must be in effectiveAllow AND in pluginDeps
    const moduleToken = `module:${specifier}`
    const isAllowed = isMatch(moduleToken, effectiveAllow)
    const isDeclared = pluginDeps && Object.prototype.hasOwnProperty.call(pluginDeps, specifier)
    if (isAllowed && isDeclared) {
      const pkgDir = path.join(pluginNodeModules, specifier)
      const pkgJsonPath = path.join(pkgDir, 'package.json')
      let entry = 'index.js'
      try {
        const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'))
        entry = pkgJson.main ?? 'index.js'
      } catch { /* package.json missing or unreadable — fall back to index.js */ }
      return compileFile(specifier, path.join(pkgDir, entry))
    }

    // Step 4 — deny list (last guard — provides actionable messages for known dangerous modules)
    const builtinMsg = DENY_BUILTINS.get(specifier)
    if (builtinMsg) {
      throw new Error(`PermissionError: '${specifier}' — ${builtinMsg}`)
    }
    const isDenied = effectiveDeny.length > 0 && isMatch(moduleToken, effectiveDeny)
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
