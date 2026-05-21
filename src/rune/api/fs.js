import fs from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'tinyglobby'
import { resolvePath, canonicalizeLocation } from './utils.js'

function stripBom(str) {
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str
}

export function createFsUtils(dir, checkPermission, pluginDir = null, pluginId = null, storeDir = null) {
  const ctx = () => ({ dir, pluginDir, pluginId, storeDir })

  return {
    async read(relPath, { throw: shouldThrow = true } = {}) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', token)
      try {
        return stripBom(await fs.readFile(abs, 'utf8'))
      } catch (err) {
        if (!shouldThrow && err.code === 'ENOENT') return null
        throw err
      }
    },

    async exists(relPath) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', token)
      try {
        await fs.access(abs)
        return true
      } catch {
        return false
      }
    },

    async glob(pattern, { ignore = [], onlyDirectories = false } = {}) {
      if (path.isAbsolute(pattern)) {
        throw new Error('utils.fs.glob does not support absolute patterns — use a relative pattern.')
      }
      const token = canonicalizeLocation(pattern, { dir })
      if (checkPermission) checkPermission('fs.glob', token)
      const results = await glob(pattern, {
        cwd: dir,
        ignore,
        onlyFiles: !onlyDirectories,
        onlyDirectories,
      })
      return results.map(r => r.replace(/\\/g, '/'))
    },

    async write(relPath, content) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', token)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, content, 'utf8')
    },

    async copy(src, dest) {
      const srcToken  = canonicalizeLocation(src,  { dir })
      const destToken = canonicalizeLocation(dest, { dir })
      if (checkPermission) checkPermission('fs.read',  srcToken)
      if (checkPermission) checkPermission('fs.write', destToken)
      const srcAbs  = resolvePath(src,  ctx())
      const destAbs = resolvePath(dest, ctx())
      await fs.mkdir(path.dirname(destAbs), { recursive: true })
      await fs.copyFile(srcAbs, destAbs)
    },
  }
}
