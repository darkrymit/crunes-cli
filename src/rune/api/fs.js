import fsPromises from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
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
        return stripBom(await fsPromises.readFile(abs, 'utf8'))
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
        await fsPromises.access(abs)
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

      // Virtual-path patterns (e.g. @local-project-cache/vault/*.enc) must be
      // resolved to a real absolute base before passing to tinyglobby, which
      // has no knowledge of the virtual prefix scheme.
      let globPattern = pattern
      let globCwd = dir
      let virtualPrefix = null
      if (pattern.startsWith('@')) {
        const absPattern = resolvePath(pattern, ctx()).replace(/\\/g, '/')
        const firstGlob = absPattern.search(/[*?{[]/)
        const staticPart = firstGlob === -1 ? absPattern : absPattern.slice(0, firstGlob)
        const lastSep = staticPart.lastIndexOf('/')
        globCwd = staticPart.slice(0, lastSep)
        globPattern = absPattern.slice(lastSep + 1)
        // Derive the virtual prefix (e.g. "@local-project-cache") to reconstruct results
        const slashIdx = pattern.indexOf('/')
        virtualPrefix = slashIdx === -1 ? pattern : pattern.slice(0, slashIdx)
      }

      const results = await glob(globPattern, {
        cwd: globCwd,
        ignore,
        dot,
        expandDirectories,
        onlyFiles: !onlyDirectories,
        onlyDirectories,
      })

      if (virtualPrefix) {
        const absBase = resolvePath(virtualPrefix, ctx())
        return results.map(r => {
          const rel = path.relative(absBase, path.join(globCwd, r)).replace(/\\/g, '/')
          return `${virtualPrefix}/${rel}`
        })
      }
      return results.map(r => r.replace(/\\/g, '/'))
    },

    async write(relPath, content) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', token)
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      await fsPromises.writeFile(abs, content, 'utf8')
    },

    async copy(src, dest) {
      const srcToken  = canonicalizeLocation(src,  { dir })
      const destToken = canonicalizeLocation(dest, { dir })
      if (checkPermission) checkPermission('fs.read',  srcToken)
      if (checkPermission) checkPermission('fs.write', destToken)
      const srcAbs  = resolvePath(src,  ctx())
      const destAbs = resolvePath(dest, ctx())
      await fsPromises.mkdir(path.dirname(destAbs), { recursive: true })
      await fsPromises.copyFile(srcAbs, destAbs)
    },

    async remove(relPath, { recursive = false } = {}) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', token)
      await fsPromises.rm(abs, { recursive, force: true })
    },

    async move(src, dest) {
      const srcToken  = canonicalizeLocation(src,  { dir })
      const destToken = canonicalizeLocation(dest, { dir })
      if (checkPermission) checkPermission('fs.read',  srcToken)
      if (checkPermission) checkPermission('fs.write', destToken)
      const srcAbs  = resolvePath(src,  ctx())
      const destAbs = resolvePath(dest, ctx())
      await fsPromises.mkdir(path.dirname(destAbs), { recursive: true })
      try {
        await fsPromises.rename(srcAbs, destAbs)
      } catch (err) {
        if (err.code === 'EXDEV') {
          await fsPromises.cp(srcAbs, destAbs, { recursive: true })
          await fsPromises.rm(srcAbs, { recursive: true, force: true })
        } else {
          throw err
        }
      }
    },

    async stat(relPath) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', token)
      const s = await fsPromises.stat(abs)
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
      await fsPromises.mkdir(abs, { recursive: true })
    },

    async readAsBytes(relPath, { throw: shouldThrow = true } = {}) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', token)
      try {
        const buffer = await fsPromises.readFile(abs)
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
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      await fsPromises.writeFile(abs, content)
    },

    async append(relPath, content) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', token)
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      await fsPromises.appendFile(abs, content, 'utf8')
    },

    async appendAsBytes(relPath, content) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', token)
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      await fsPromises.appendFile(abs, content)
    },

    async chmod(relPath, mode) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', token)
      await fsPromises.chmod(abs, mode)
    },

    readStreamIter(relPath) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', token)
      return createReadStream(abs)
    },

    async writeStreamRef(relPath) {
      const token = canonicalizeLocation(relPath, { dir })
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', token)
      
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      const stream = createWriteStream(abs)
      return {
        write(chunk) {
          return new Promise((resolve, reject) => {
            const onDrain = () => {
              stream.removeListener('error', onError)
              resolve()
            }
            const onError = (err) => {
              stream.removeListener('drain', onDrain)
              reject(err)
            }
            
            if (!stream.write(chunk)) {
              stream.once('drain', onDrain)
              stream.once('error', onError)
            } else {
              resolve()
            }
          })
        },
        close() {
          return new Promise((resolve, reject) => {
            const onError = (err) => reject(err)
            stream.once('error', onError)
            stream.end(() => {
              stream.removeListener('error', onError)
              resolve()
            })
          })
        }
      }
    },
  }
}
