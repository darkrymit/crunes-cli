import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ALLOW_BUILTINS, DENY_BUILTINS } from './builtins.js'
import micromatch from 'micromatch'

const require = createRequire(import.meta.url)

/**
 * Create an ESM module resolver for use inside an isolated-vm isolate.
 *
 * Priority order (first match wins):
 *   1. Relative / absolute path    → plugin's own files
 *   2. ALLOW_BUILTINS              → safe Node built-in proxy
 *   3. effectiveAllow ∩ pluginDeps → declared npm dep from plugin node_modules
 *   4. DENY_BUILTINS ∪ effectiveDeny → PermissionError with message
 *   5. Zero-trust default          → PermissionError
 */
export function createModuleResolver(isolate, pluginDir, pluginNodeModules, pluginDeps, effectiveAllow, effectiveDeny) {
  // Cache compiled modules to avoid re-compiling within one isolate lifetime
  const cache = new Map()

  async function compileFile(specifier, absPath) {
    if (cache.has(specifier)) return cache.get(specifier)
    const source = await fs.readFile(absPath, 'utf8')
    const mod = await isolate.compileModule(source, { filename: absPath })
    cache.set(specifier, mod)
    return mod
  }

  async function compileBuiltinProxy(specifier) {
    if (cache.has(specifier)) return cache.get(specifier)
    // Build a thin ESM proxy that re-exports from the host's require
    const hostExports = require(specifier)
    const names = Object.keys(hostExports).filter(k => k !== 'default')
    const namedExports = names.map(n => `export const ${n} = hostExports.${n};`).join('\n')
    const source = `
const hostExports = $__hostRequire('${specifier}');
${namedExports}
export default hostExports.default ?? hostExports;
`.trim()
    const mod = await isolate.compileModule(source, { filename: `builtin:${specifier}` })
    cache.set(specifier, mod)
    return mod
  }

  return async function moduleResolver(specifier, referrer) {
    // Step 1 — relative or absolute path: plugin's own files
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const baseDir = referrer?.filename ? path.dirname(referrer.filename) : pluginDir
      const absPath = path.resolve(baseDir, specifier)
      return compileFile(absPath, absPath) // Use absPath as cache key instead of specifier
    }

    // Step 2 — safe Node built-in
    if (ALLOW_BUILTINS.has(specifier)) {
      return compileBuiltinProxy(specifier)
    }

    // Step 3 — declared npm dep: must be in effectiveAllow AND in pluginDeps
    const moduleToken = `module:${specifier}`
    const isAllowed = micromatch.isMatch(moduleToken, effectiveAllow)
    const isDeclared = pluginDeps && Object.prototype.hasOwnProperty.call(pluginDeps, specifier)
    if (isAllowed && isDeclared) {
      const pkgDir     = path.join(pluginNodeModules, specifier)
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
    const isDenied = effectiveDeny.length > 0 && micromatch.isMatch(moduleToken, effectiveDeny)
    if (isDenied) {
      throw new Error(`PermissionError: '${specifier}' is explicitly denied.`)
    }

    // Step 5 — zero-trust default
    throw new Error(
      `PermissionError: '${specifier}' is not available.\n` +
      `Add "module:${specifier}" to allow in permissions and "${specifier}" to dependencies.`
    )
  }
}
