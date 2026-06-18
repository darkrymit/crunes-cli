import fsPromises from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import path from 'node:path'
import { glob } from 'tinyglobby'
import chokidar from 'chokidar'
import picomatch from 'picomatch'
import { resolvePath } from './utils.js'

function stripBom(str) {
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str
}

function sliceLines(content, from, to) {
  if (from == null && to == null) return content
  const hadTrailing = content.endsWith('\n')
  const lines = hadTrailing ? content.slice(0, -1).split('\n') : content.split('\n')
  const len = lines.length
  const start = from == null ? 0 : from >= 0 ? from - 1 : Math.max(0, len + from)
  const end   = to   == null ? len : to >= 0 ? to : Math.max(0, len + to + 1)
  const sliced = lines.slice(start, end)
  if (sliced.length === 0) return ''
  return sliced.join('\n') + (hadTrailing ? '\n' : '')
}

export function createFsUtils(dir, checkPermission, pluginDir = null, pluginId = null, storeDir = null) {
  const ctx = () => ({ dir, pluginDir, pluginId, storeDir })

  return {
    async read(relPath, { throw: shouldThrow = true, from, to } = {}) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', relPath)
      try {
        const content = stripBom(await fsPromises.readFile(abs, 'utf8'))
        return sliceLines(content, from, to)
      } catch (err) {
        if (!shouldThrow && err.code === 'ENOENT') return null
        throw err
      }
    },

    async resolve(relPath = '.') {
      return resolvePath(relPath, ctx())
    },

    async exists(relPath) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', relPath)
      try {
        await fsPromises.access(abs)
        return true
      } catch {
        return false
      }
    },

    async glob(pattern, { cwd: cwdOpt, ignore = [], onlyDirectories = false, dot = false, expandDirectories = false } = {}) {
      if (path.isAbsolute(pattern)) {
        throw new Error('utils.fs.glob does not support absolute patterns — use a relative pattern.')
      }
      const resolvedCwd = cwdOpt ? resolvePath(cwdOpt, ctx()) : dir
      if (checkPermission) checkPermission('fs.glob', pattern, resolvedCwd)

      const results = await glob(pattern, {
        cwd: resolvedCwd,
        ignore,
        dot,
        expandDirectories,
        onlyFiles: !onlyDirectories,
        onlyDirectories,
      })

      return results.map(r => r.replace(/\\/g, '/'))
    },

    async write(relPath, content) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      await fsPromises.writeFile(abs, content, 'utf8')
    },

    async copy(src, dest) {
      if (checkPermission) checkPermission('fs.read',  src)
      if (checkPermission) checkPermission('fs.write', dest)
      const srcAbs  = resolvePath(src,  ctx())
      const destAbs = resolvePath(dest, ctx())
      await fsPromises.mkdir(path.dirname(destAbs), { recursive: true })
      await fsPromises.copyFile(srcAbs, destAbs)
    },

    async remove(relPath, { recursive = false } = {}) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      await fsPromises.rm(abs, { recursive, force: true })
    },

    async move(src, dest) {
      if (checkPermission) checkPermission('fs.read',  src)
      if (checkPermission) checkPermission('fs.write', dest)
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
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', relPath)
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
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      await fsPromises.mkdir(abs, { recursive: true })
    },

    async readBytes(relPath, { throw: shouldThrow = true } = {}) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', relPath)
      try {
        const buffer = await fsPromises.readFile(abs)
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      } catch (err) {
        if (!shouldThrow && err.code === 'ENOENT') return null
        throw err
      }
    },

    async writeBytes(relPath, content) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      await fsPromises.writeFile(abs, content)
    },

    async append(relPath, content) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      await fsPromises.appendFile(abs, content, 'utf8')
    },

    async prepend(relPath, content) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', relPath)
      if (checkPermission) checkPermission('fs.write', relPath)
      let existing = ''
      try {
        existing = await fsPromises.readFile(abs, 'utf8')
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      await fsPromises.writeFile(abs, content + existing, 'utf8')
    },

    async appendBytes(relPath, content) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      await fsPromises.appendFile(abs, content)
    },

    async chmod(relPath, mode) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      await fsPromises.chmod(abs, mode)
    },

    readStreamIter(relPath) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.read', relPath)
      return createReadStream(abs)
    },

    async appendStreamRef(relPath) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)

      await fsPromises.mkdir(path.dirname(abs), { recursive: true })
      const stream = createWriteStream(abs, { flags: 'a' })
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

    async writeStreamRef(relPath) {
      const abs   = resolvePath(relPath, ctx())
      if (checkPermission) checkPermission('fs.write', relPath)
      
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

    watch(pattern, callback, { debounce = 50 } = {}) {
      if (checkPermission) checkPermission('fs.read', pattern)
      const isGlob = /[*?{}\[\]!]/.test(pattern)
      const watchRoot = isGlob
        ? path.join(dir, pattern.replace(/[*?{}\[\]!].*$/, '').replace(/\/$/, '') || '.')
        : path.isAbsolute(pattern) ? pattern : path.join(dir, pattern)
      const isMatch = isGlob ? picomatch(pattern) : null
      const timers = new Map()

      const fire = (type, filePath) => {
        const rel = path.relative(dir, filePath).replace(/\\/g, '/')
        if (isMatch && !isMatch(rel)) return
        const key = `${type}:${rel}`
        if (timers.has(key)) clearTimeout(timers.get(key))
        timers.set(key, setTimeout(() => {
          timers.delete(key)
          callback({ type, path: rel })
        }, debounce))
      }

      const watcher = chokidar.watch(watchRoot, {
        ignoreInitial: true,
        persistent: false,
      })

      watcher.on('add',    p => fire('create', p))
      watcher.on('change', p => fire('modify', p))
      watcher.on('unlink', p => fire('delete', p))

      return {
        stop() { watcher.close() }
      }
    },
  }
}
