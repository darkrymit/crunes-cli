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

    async resolve(relPath = '.') {
      return resolvePath(relPath, ctx())
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

    async glob(pattern, { ignore = [], onlyDirectories = false, dot = false, expandDirectories = false } = {}) {
      if (path.isAbsolute(pattern)) {
        throw new Error('utils.fs.glob does not support absolute patterns — use a relative pattern.')
      }
      const token = canonicalizeLocation(pattern, { dir })
      if (checkPermission) checkPermission('fs.glob', token)
      const results = await glob(pattern, {
        cwd: dir,
        ignore,
        dot,
        expandDirectories,
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

    async remove(relPath, { recursive = false } = {}) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', token)
      await fs.rm(abs, { recursive, force: true })
    },

    async move(src, dest) {
      const srcToken  = canonicalizeLocation(src,  { dir })
      const destToken = canonicalizeLocation(dest, { dir })
      if (checkPermission) checkPermission('fs.read',  srcToken)
      if (checkPermission) checkPermission('fs.write', destToken)
      const srcAbs  = resolvePath(src,  ctx())
      const destAbs = resolvePath(dest, ctx())
      await fs.mkdir(path.dirname(destAbs), { recursive: true })
      try {
        await fs.rename(srcAbs, destAbs)
      } catch (err) {
        if (err.code === 'EXDEV') {
          await fs.cp(srcAbs, destAbs, { recursive: true })
          await fs.rm(srcAbs, { recursive: true, force: true })
        } else {
          throw err
        }
      }
    },

    async stat(relPath) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', token)
      const s = await fs.stat(abs)
      return {
        size: s.size,
        mtime: s.mtime.toISOString(),
        birthtime: s.birthtime.toISOString(),
        isDirectory: s.isDirectory(),
        isFile: s.isFile(),
      }
    },

    async mkdir(relPath) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', token)
      await fs.mkdir(abs, { recursive: true })
    },

    async readAsBytes(relPath, { throw: shouldThrow = true } = {}) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', token)
      try {
        const buffer = await fs.readFile(abs)
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      } catch (err) {
        if (!shouldThrow && err.code === 'ENOENT') return null
        throw err
      }
    },

    async writeAsBytes(relPath, content) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', token)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, content)
    },

    async append(relPath, content) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', token)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.appendFile(abs, content, 'utf8')
    },

    async appendAsBytes(relPath, content) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', token)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.appendFile(abs, content)
    },

    async chmod(relPath, mode) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', token)
      await fs.chmod(abs, mode)
    },
  }
}
