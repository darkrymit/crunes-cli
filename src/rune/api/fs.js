import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { glob } from 'tinyglobby'

function stripBom(str) {
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str
}

function canonicalizePath(dir, inputPath) {
  const p = inputPath.replace(/\\/g, '/')

  if (p.startsWith('@plugin/')) return p
  if (p === '~' || p.startsWith('~/')) return p
  if (path.isAbsolute(inputPath)) return p

  const resolved = path.resolve(dir, inputPath)
  const rel = path.relative(dir, resolved).replace(/\\/g, '/')
  return rel.startsWith('..') ? rel : './' + rel
}

function resolveToAbs(dir, pluginDir, inputPath) {
  if (inputPath.startsWith('@plugin/')) {
    if (!pluginDir) throw new Error('@plugin/ paths are only available in plugin runes')
    return path.join(pluginDir, inputPath.slice('@plugin/'.length))
  }
  if (inputPath === '~' || inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return path.join(os.homedir(), inputPath.slice(1))
  }
  if (path.isAbsolute(inputPath)) return inputPath
  return path.resolve(dir, inputPath)
}

export function createFsUtils(dir, checkPermission, pluginDir = null) {
  return {
    async read(relPath, { throw: shouldThrow = true } = {}) {
      const token = canonicalizePath(dir, relPath)
      const abs = resolveToAbs(dir, pluginDir, relPath)
      if (checkPermission) checkPermission('fs.read', token)
      try {
        return stripBom(await fs.readFile(abs, 'utf8'))
      } catch (err) {
        if (!shouldThrow && err.code === 'ENOENT') return null
        throw err
      }
    },

    async exists(relPath) {
      const token = canonicalizePath(dir, relPath)
      const abs = resolveToAbs(dir, pluginDir, relPath)
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
      const token = canonicalizePath(dir, pattern)
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
      const token = canonicalizePath(dir, relPath)
      const abs = resolveToAbs(dir, pluginDir, relPath)
      if (checkPermission) checkPermission('fs.write', token)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, content, 'utf8')
    },
  }
}
