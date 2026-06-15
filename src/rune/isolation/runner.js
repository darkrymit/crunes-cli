import ivm from 'isolated-vm'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn as spawnProcess } from 'node:child_process'
import { createUtils } from '../api/index.js'
import { getAutoPermits } from '../api/utils.js'
import { createModuleResolver } from './resolver.js'
import { DENY_BUILTINS } from './builtins.js'
import { createJob, getJob } from '../../job/index.js'
import { updateJobPid, jobStdoutPath, jobStderrPath, jobStdinPath } from '../../job/registry.js'
import { EOF_SENTINEL } from '../../job/stdin-tail.js'
import fsSync from 'node:fs'
import { ensureProjectIdentity } from '../../project/index.js'
import { hash, hashAsHex, hashAsBase64, hmac, hmacAsHex, hmacAsBase64, encrypt, decrypt, uuid as cryptoUuid, randomHex as cryptoHex, randomBase64 as cryptoBase64, randomBytesFn } from '../api/crypto.js'
import { computeEffectivePermissions, makePermissionChecker } from '../permissions/permissions.js'
import { isVerbose } from '../../shared/output.js'
import * as EMBEDDED from './embedded.js'
import { parseArgs } from '../api/args-parser.js'
import { RuneSession } from '../api/rune.js'
import { formatHelp } from '../../docs/formatter.js'

const __isolationDir = path.dirname(fileURLToPath(import.meta.url))

const DYNAMIC_IMPORT_RE = /\bimport\s*\(/

function assertNoDynamicImport(src, runeFile) {
  if (DYNAMIC_IMPORT_RE.test(src)) {
    throw new Error(
      `Rune "${runeFile}" uses dynamic import() which is not supported in the crunes VM.\n` +
      `Use static top-level imports instead: import ... from '...'`
    )
  }
}

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

async function injectUtils(isolate, context, utils, _runeCallback, vars, projectDir, checkPermission, currentRuneKey, sections, onEvent, helpText) {
  const jail = context.global
  // Wrap async Reference callbacks so their rejected promises are caught on the
  // host side, preventing Node unhandledRejection events. ivm still receives the
  // rejection via its own internal .then() chain and propagates it into the isolate.
  const asyncRef = (fn) => new ivm.Reference((...args) => {
    const p = fn(...args)
    if (p && typeof p.catch === 'function') p.catch(() => {})
    return p
  })

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
  await jail.set('$__utils_fs_remove', new ivm.Reference(async (relPath, opts) => {
    return utils.fs.remove(relPath, opts)
  }))
  await jail.set('$__utils_fs_move', new ivm.Reference(async (src, dest) => {
    return utils.fs.move(src, dest)
  }))
  await jail.set('$__utils_fs_stat', new ivm.Reference(async (relPath) => {
    return utils.fs.stat(relPath)
  }))
  await jail.set('$__utils_fs_mkdir', new ivm.Reference(async (relPath) => {
    return utils.fs.mkdir(relPath)
  }))
  await jail.set('$__utils_fs_read_bytes', new ivm.Reference(async (relPath, opts) => {
    const bytes = await utils.fs.readAsBytes(relPath, opts)
    if (!bytes) return null
    const copy = new Uint8Array(bytes.length)
    copy.set(bytes)
    return copy.buffer
  }))
  await jail.set('$__utils_fs_write_bytes', new ivm.Reference(async (relPath, arrayBuffer, byteOffset, byteLength) => {
    const bytes = new Uint8Array(arrayBuffer, byteOffset ?? 0, byteLength ?? arrayBuffer.byteLength)
    return utils.fs.writeAsBytes(relPath, bytes)
  }))
  await jail.set('$__utils_fs_append', new ivm.Reference(async (relPath, content) => {
    return utils.fs.append(relPath, content)
  }))
  await jail.set('$__utils_fs_append_bytes', new ivm.Reference(async (relPath, arrayBuffer, byteOffset, byteLength) => {
    const bytes = new Uint8Array(arrayBuffer, byteOffset ?? 0, byteLength ?? arrayBuffer.byteLength)
    return utils.fs.appendAsBytes(relPath, bytes)
  }))
  await jail.set('$__utils_fs_chmod', new ivm.Reference(async (relPath, mode) => {
    return utils.fs.chmod(relPath, mode)
  }))

  const streams = new Map()
  let nextStreamId = 1

  await jail.set('$__utils_fs_readStream', new ivm.Reference(async (relPath) => {
    const iter = utils.fs.readStreamIter(relPath)[Symbol.asyncIterator]()
    const id = nextStreamId++
    streams.set(id, iter)
    return id
  }))
  await jail.set('$__utils_fs_readStream_next', new ivm.Reference(async (id) => {
    const iter = streams.get(id)
    if (!iter) throw new Error(`Invalid read stream ID: ${id}`)
    const { value, done } = await iter.next()
    if (done) {
      streams.delete(id)
      return null
    }
    const copy = new Uint8Array(value.length)
    copy.set(value)
    return copy.buffer
  }))

  await jail.set('$__utils_fs_writeStream', new ivm.Reference(async (relPath) => {
    const ref = await utils.fs.writeStreamRef(relPath)
    const id = nextStreamId++
    streams.set(id, ref)
    return id
  }))
  await jail.set('$__utils_fs_writeStream_write', new ivm.Reference(async (id, arrayBuffer, byteOffset, byteLength) => {
    const ref = streams.get(id)
    if (!ref) throw new Error(`Invalid write stream ID: ${id}`)
    const bytes = new Uint8Array(arrayBuffer, byteOffset ?? 0, byteLength ?? arrayBuffer.byteLength)
    await ref.write(bytes)
  }))
  await jail.set('$__utils_fs_writeStream_close', new ivm.Reference(async (id) => {
    const ref = streams.get(id)
    if (!ref) throw new Error(`Invalid write stream ID: ${id}`)
    await ref.close()
    streams.delete(id)
  }))
  const shellHandles = new Map()
  let nextShellHandle = 0

  await jail.set('$__utils_shell_exec', asyncRef(async (cmd, opts, stdinStreamId) => {
    let stdinStream
    if (stdinStreamId !== undefined && stdinStreamId !== null) {
      const { PassThrough } = await import('node:stream')
      const stream = new PassThrough()
      stdinStream = stream
      
      const wrapped = {
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
      streams.set(stdinStreamId, wrapped)
    }
    
    const res = await utils.shell.exec(cmd, { ...opts, stdin: stdinStream })
    
    if (res && typeof res === 'object') {
      if (res.stdout instanceof Uint8Array) {
        const copy = new Uint8Array(res.stdout)
        const ab = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)
        return {
          stdout: ab,
          stderr: res.stderr,
          exitCode: res.exitCode,
          ok: res.ok,
        }
      } else {
        return {
          stdout: res.stdout,
          stderr: res.stderr,
          exitCode: res.exitCode,
          ok: res.ok,
        }
      }
    }
    return res
  }))
  await jail.set('$__utils_shell_spawn_open', new ivm.Reference((cmd, opts) => {
    const session = utils.shell.spawn(cmd, opts)
    const id = String(nextShellHandle++)
    shellHandles.set(id, session)
    return id
  }))
  await jail.set('$__utils_shell_spawn_start', new ivm.Reference((id) => {
    const handle = shellHandles.get(id)
    if (handle) handle.open()
  }))
  await jail.set('$__utils_shell_spawn_write', new ivm.Reference((idRef, chunkRef) => {
    const id = typeof idRef === 'object' && idRef.copySync ? idRef.copySync() : idRef
    const chunk = typeof chunkRef === 'object' && chunkRef.copySync ? chunkRef.copySync() : chunkRef
    const handle = shellHandles.get(id)
    if (handle) {
      if (chunk instanceof ArrayBuffer) {
        handle.write(Buffer.from(chunk))
      } else {
        handle.write(chunk)
      }
    }
  }))
  await jail.set('$__utils_shell_spawn_end', new ivm.Reference((id) => {
    const handle = shellHandles.get(id)
    if (handle) {
      handle.proc.stdin.end()
    }
  }))
  await jail.set('$__utils_shell_spawn_on', new ivm.Reference((idRef, typeRef, eventRef, callbackRef) => {
    const id = typeof idRef === 'object' && idRef.copySync ? idRef.copySync() : idRef
    const type = typeof typeRef === 'object' && typeRef.copySync ? typeRef.copySync() : typeRef
    const event = typeof eventRef === 'object' && eventRef.copySync ? eventRef.copySync() : eventRef
    const handle = shellHandles.get(id)
    if (handle) {
      handle.setHandler(type, event, callbackRef)
    }
  }))
  await jail.set('$__utils_shell_spawn_kill', new ivm.Reference((id, signal) => {
    const handle = shellHandles.get(id)
    if (handle) {
      handle.kill(signal ?? undefined)
      shellHandles.delete(id)
    }
  }))

  const { id: pKey } = await ensureProjectIdentity(projectDir)
  await jail.set('$__utils_shell_job_start', asyncRef(async (cmd, opts) => {
    checkPermission('shell.job.start', cmd)
    return utils.shell.createShellJob(cmd, opts, {
      createJob, updateJobPid, jobStdoutPath, jobStderrPath, jobStdinPath,
      spawnedBy: currentRuneKey, projectKey: pKey, projectDir,
    })
  }))
  await jail.set('$__utils_shell_job_write', asyncRef(async (id, text) => {
    checkPermission('shell.job.read', null)
    const record = await getJob(pKey, id)
    if (!record) throw new Error(`Unknown job: ${id}`)
    const logPath = jobStdinPath(record.projectKey, id)
    await fsSync.promises.appendFile(logPath, text + '\n', 'utf8')
  }))
  await jail.set('$__utils_shell_job_write_eof', asyncRef(async (id) => {
    checkPermission('shell.job.read', null)
    const record = await getJob(pKey, id)
    if (!record) throw new Error(`Unknown job: ${id}`)
    const logPath = jobStdinPath(record.projectKey, id)
    await fsSync.promises.appendFile(logPath, EOF_SENTINEL + '\n', 'utf8')
  }))
  await jail.set('$__utils_shell_job_kill', asyncRef(async (id, signal) => {
    checkPermission('shell.job.kill', null)
    const sig = signal ?? 'SIGTERM'
    if (!VALID_SIGNALS.has(sig)) throw new Error(`Invalid signal: ${sig}`)
    const record = await getJob(pKey, id)
    if (!record) return
    if (process.platform === 'win32') {
      try { spawnProcess('taskkill', ['/F', '/T', '/PID', String(record.pid)], { stdio: 'ignore' }) } catch {}
    } else {
      try { process.kill(-record.pid, sig) } catch {}
    }
  }))
  await jail.set('$__utils_shell_job_exists', asyncRef(async (id) => {
    checkPermission('shell.job.exists', null)
    const record = await getJob(pKey, id)
    if (!record) return false
    try { process.kill(record.pid, 0); return true } catch { return false }
  }))
  await jail.set('$__utils_shell_job_stdout', asyncRef(async (id) => {
    checkPermission('shell.job.read', null)
    const record = await getJob(pKey, id)
    if (!record) throw new Error(`Unknown job: ${id}`)
    const logPath = jobStdoutPath(record.projectKey, id)
    if (!fsSync.existsSync(logPath)) return ''
    return fsSync.promises.readFile(logPath, 'utf8')
  }))
  await jail.set('$__utils_shell_job_stderr', asyncRef(async (id) => {
    checkPermission('shell.job.read', null)
    const record = await getJob(pKey, id)
    if (!record) throw new Error(`Unknown job: ${id}`)
    const logPath = jobStderrPath(record.projectKey, id)
    if (!fsSync.existsSync(logPath)) return ''
    return fsSync.promises.readFile(logPath, 'utf8')
  }))

  await jail.set('$__utils_section_emit', new ivm.Reference((sectionOrArray) => {
    const items = Array.isArray(sectionOrArray) ? sectionOrArray : [sectionOrArray]
    for (const section of items) {
      if (sections) sections.push(section)
      if (onEvent) onEvent({ type: 'section', section })
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
  await jail.set('$__utils_rune_exec', asyncRef(async (runeKey, args, opts) => {
    const repl = opts?.repl === true
    if (repl) {
      checkPermission('rune.repl', runeKey)
    } else {
      checkPermission('rune.run', runeKey)
    }
    const cliPath = process.argv[1]
    const cliArgs = repl
      ? [cliPath, '--cwd', projectDir, 'repl', '--format', 'jsonl', runeKey, ...(args ?? [])]
      : [cliPath, '--cwd', projectDir, 'run', '--format', 'jsonl', runeKey, ...(args ?? [])]
    const child = spawnProcess(
      process.execPath,
      cliArgs,
      { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CRUNES_NO_TIMEOUT: '1' }, windowsHideConsole: true }
    )
    const stdinInput = opts?.stdin
    if (stdinInput !== undefined && stdinInput !== null) {
      if (typeof stdinInput === 'string') {
        child.stdin.write(stdinInput)
        child.stdin.end()
      } else if (stdinInput && typeof stdinInput.pipe === 'function') {
        stdinInput.pipe(child.stdin)
      } else {
        child.stdin.end()
      }
    } else {
      child.stdin.end()
    }
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    const exitCode = await new Promise(resolve => child.on('close', resolve))
    const sections = []
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed.type === 'section') sections.push(parsed.section)
      } catch {}
    }
    return { sections, stdout, stderr, exitCode, ok: exitCode === 0 }
  }))
  await jail.set('$__utils_rune_spawn_open', new ivm.Reference((runeKey, args, opts) => {
    const repl = opts?.repl === true
    if (repl) {
      checkPermission('rune.repl', runeKey)
    } else {
      checkPermission('rune.run', runeKey)
    }
    const session = new RuneSession(runeKey, args, { cliPath: process.argv[1], projectDir, repl })
    const id = String(nextShellHandle++)
    shellHandles.set(id, session)
    return id
  }))
  await jail.set('$__utils_rune_spawn_start', new ivm.Reference((id) => {
    const handle = shellHandles.get(id)
    if (handle) handle.open()
  }))
  await jail.set('$__utils_rune_spawn_on', new ivm.Reference((idRef, typeRef, eventRef, callbackRef) => {
    const id = typeof idRef === 'object' && idRef.copySync ? idRef.copySync() : idRef
    const type = typeof typeRef === 'object' && typeRef.copySync ? typeRef.copySync() : typeRef
    const event = typeof eventRef === 'object' && eventRef.copySync ? eventRef.copySync() : eventRef
    const handle = shellHandles.get(id)
    if (handle) handle.setHandler(type, event, callbackRef)
  }))
  await jail.set('$__utils_rune_spawn_kill', new ivm.Reference((id, signal) => {
    const handle = shellHandles.get(id)
    if (handle) { handle.kill(signal ?? undefined); shellHandles.delete(id) }
  }))
  await jail.set('$__utils_rune_spawn_write', new ivm.Reference((id, text) => {
    const handle = shellHandles.get(id)
    if (handle) handle.write(text)
  }))
  await jail.set('$__utils_rune_spawn_write_eof', new ivm.Reference((id) => {
    const handle = shellHandles.get(id)
    if (handle) handle.writeEof()
  }))
  await jail.set('$__utils_rune_spawn_write_interrupt', new ivm.Reference((id) => {
    const handle = shellHandles.get(id)
    if (handle) handle.writeInterrupt()
  }))
  await jail.set('$__utils_rune_spawn_stdin_write', new ivm.Reference((id, chunk) => {
    const handle = shellHandles.get(id)
    if (handle) handle.stdin.write(chunk)
  }))
  await jail.set('$__utils_rune_job_start', asyncRef(async (runeKey, args, opts) => {
    const repl = opts?.repl ?? false
    checkPermission(repl ? 'rune.repl' : 'rune.job.start', runeKey)
    const cliPath = process.argv[1]
    const { id } = await createJob(null, { type: 'rune', spawnedBy: currentRuneKey, runeKey, projectDir, args: args ?? [] })
    const outFd = fsSync.openSync(jobStdoutPath(pKey, id), 'a')
    const errFd = fsSync.openSync(jobStderrPath(pKey, id), 'a')
    const cliArgs = repl
      ? [cliPath, '--cwd', projectDir, 'repl', '--format', 'jsonl', runeKey, ...(args ?? [])]
      : [cliPath, '--cwd', projectDir, 'run', '--format', 'jsonl', runeKey, ...(args ?? [])]
    let childEnv = { ...process.env, CRUNES_NO_TIMEOUT: '1' }
    if (repl) {
      const stdinLog = jobStdinPath(pKey, id)
      fsSync.writeFileSync(stdinLog, '')
      childEnv = { ...childEnv, CRUNES_STDIN_LOG: stdinLog }
    }
    const child = spawnProcess(
      process.execPath,
      cliArgs,
      { detached: true, stdio: ['ignore', outFd, errFd], env: childEnv, windowsHide: true }
    )
    await updateJobPid(pKey, id, child.pid)
    child.unref()
    fsSync.closeSync(outFd)
    fsSync.closeSync(errFd)
    return { id }
  }))
  await jail.set('$__utils_rune_job_kill', asyncRef(async (id, signal) => {
    const sig = signal ?? 'SIGTERM'
    if (!VALID_SIGNALS.has(sig)) throw new Error(`Invalid signal: ${sig}`)
    checkPermission('rune.job.kill', null)
    const record = await getJob(pKey, id)
    if (!record) return
    try { process.kill(record.pid, sig) } catch { /* already gone */ }
  }))
  await jail.set('$__utils_rune_job_exists', asyncRef(async (id) => {
    checkPermission('rune.job.exists', null)
    const record = await getJob(pKey, id)
    if (!record) return false
    try { process.kill(record.pid, 0); return true } catch { return false }
  }))
  await jail.set('$__utils_rune_job_stdout', asyncRef(async (id) => {
    checkPermission('rune.job.read', null)
    const record = await getJob(pKey, id)
    if (!record) throw new Error(`Unknown job: ${id}`)
    const logPath = jobStdoutPath(record.projectKey, id)
    if (!fsSync.existsSync(logPath)) return ''
    return fsSync.promises.readFile(logPath, 'utf8')
  }))
  await jail.set('$__utils_rune_job_stderr', asyncRef(async (id) => {
    checkPermission('rune.job.read', null)
    const record = await getJob(pKey, id)
    if (!record) throw new Error(`Unknown job: ${id}`)
    const logPath = jobStderrPath(record.projectKey, id)
    if (!fsSync.existsSync(logPath)) return ''
    return fsSync.promises.readFile(logPath, 'utf8')
  }))
  await jail.set('$__utils_rune_job_sections', asyncRef(async (id) => {
    checkPermission('rune.job.read', null)
    const record = await getJob(pKey, id)
    if (!record) throw new Error(`Unknown job: ${id}`)
    const logPath = jobStdoutPath(record.projectKey, id)
    if (!fsSync.existsSync(logPath)) return []
    const content = await fsSync.promises.readFile(logPath, 'utf8')
    const sections = []
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed.type === 'section') sections.push(parsed.section)
      } catch {}
    }
    return sections
  }))
  await jail.set('$__utils_rune_job_write', asyncRef(async (id, text) => {
    checkPermission('rune.job.read', null)
    const record = await getJob(pKey, id)
    if (!record) throw new Error(`Unknown job: ${id}`)
    const logPath = jobStdinPath(record.projectKey, id)
    await fsSync.promises.appendFile(logPath, JSON.stringify({ type: 'line', text }) + '\n', 'utf8')
  }))
  await jail.set('$__utils_rune_job_write_eof', asyncRef(async (id) => {
    checkPermission('rune.job.read', null)
    const record = await getJob(pKey, id)
    if (!record) throw new Error(`Unknown job: ${id}`)
    const logPath = jobStdinPath(record.projectKey, id)
    await fsSync.promises.appendFile(logPath, JSON.stringify({ type: 'eof', text: '' }) + '\n', 'utf8')
  }))
  await jail.set('$__utils_time_after', new ivm.Reference((ms) => {
    return new Promise(resolve => setTimeout(resolve, ms).unref())
  }))
  await jail.set('$__utils_time_after_ref', new ivm.Reference((ms) => {
    return new Promise(resolve => setTimeout(resolve, ms))
  }))
  await jail.set('$__utils_json_read', new ivm.Reference(async (relPath, opts) => {
    return utils.json.read(relPath, opts)
  }))
  await jail.set('$__utils_json_readPath', new ivm.Reference(async (relPath, jsonPath, defaultVal) => {
    return utils.json.readPath(relPath, jsonPath, defaultVal)
  }))
  await jail.set('$__utils_json_readPathAll', new ivm.Reference(async (relPath, jsonPath, defaultVal) => {
    return utils.json.readPathAll(relPath, jsonPath, defaultVal)
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
  await jail.set('$__utils_http_fetch', new ivm.Reference(async (urlRef, optsRef, onChunk, onEnd, onError, signalListenerRef) => {
    const url  = urlRef.copySync()
    const opts = optsRef.copySync()
    let body = opts?.body
    let headers = opts?.headers ? { ...opts.headers } : {}
    if (body && typeof body === 'object' && body.type === 'FormData') {
      const fd = new FormData()
      for (const part of body.parts) {
        const value = part.value && typeof part.value === 'object' && part.value.type === 'Buffer'
          ? new Blob([new Uint8Array(part.value.data)], { type: part.value.contentType ?? 'application/octet-stream' })
          : part.value
        if (part.filename) fd.append(part.name, value, part.filename)
        else fd.append(part.name, value)
      }
      body = fd
      delete headers['content-type']
    } else if (Array.isArray(body)) {
      body = body.map(entry => {
        if (entry.value && typeof entry.value === 'object' && entry.value.type === 'Buffer') {
          return { ...entry, value: new Uint8Array(entry.value.data) }
        }
        return entry
      })
    } else if (body && typeof body === 'object' && body.type === 'Buffer') {
      body = new Uint8Array(body.data)
    }
    let signal = null
    if (signalListenerRef) {
      const ctrl = new AbortController()
      signal = ctrl.signal
      await signalListenerRef.apply(undefined, [new ivm.Reference(() => ctrl.abort())], { arguments: { reference: true } })
    }
    try {
      const res = await utils.http.fetch(url, { ...opts, headers, body, signal })
      const headerPairs = typeof res.headers?.entries === 'function'
        ? [...res.headers.entries()]
        : Object.entries(res.headers ?? {})
      await onChunk.apply(undefined, [null, { ok: res.ok, status: res.status, statusText: res.statusText, headers: headerPairs }], {
        arguments: { copy: true }, result: { promise: true }
      })
      for await (const chunk of res.body) {
        await onChunk.apply(undefined, [chunk, null], { arguments: { copy: true }, result: { promise: true } })
      }
      await onEnd.apply(undefined, [], { result: { promise: true } })
    } catch (err) {
      await onError.apply(undefined, [err.message], { arguments: { copy: true }, result: { promise: true } })
    }
  }))
  await jail.set('$__utils_http_body_reader', new ivm.Reference(async (urlRef, optsRef, pullChunk, onChunk, onEnd, onError) => {
    const url = typeof urlRef === 'object' && urlRef.copySync ? urlRef.copySync() : urlRef
    const opts = typeof optsRef === 'object' && optsRef.copySync ? optsRef.copySync() : optsRef
    const { Readable } = await import('node:stream')
    let done = false
    const nodeReadable = new Readable({
      async read() {
        if (done) { this.push(null); return }
        try {
          const ab = await pullChunk.apply(undefined, [], { result: { promise: true, copy: true } })
          if (ab === null) {
            done = true
            this.push(null)
          } else {
            this.push(Buffer.from(new Uint8Array(ab)))
          }
        } catch (err) {
          this.destroy(err)
        }
      }
    })
    try {
      const res = await utils.http.fetch(url, { ...opts, duplex: 'half', body: nodeReadable })
      const headerPairs = typeof res.headers?.entries === 'function'
        ? [...res.headers.entries()]
        : Object.entries(res.headers ?? {})
      await onChunk.apply(undefined, [null, { ok: res.ok, status: res.status, statusText: res.statusText, headers: headerPairs }], {
        arguments: { copy: true }, result: { promise: true }
      })
      for await (const chunk of res.body) {
        await onChunk.apply(undefined, [chunk, null], { arguments: { copy: true }, result: { promise: true } })
      }
      await onEnd.apply(undefined, [], { result: { promise: true } })
    } catch (err) {
      await onError.apply(undefined, [err.message], { arguments: { copy: true }, result: { promise: true } })
    }
  }))
  await jail.set('$__utils_env_read', new ivm.Reference(async (key, fallback) => {
    const result = utils.env.read(key, fallback)
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
  await jail.set('$__utils_archive_untar', new ivm.Reference(async (source, dest, opts) => {
    await utils.archive.untar(source, dest, opts)
  }))
  await jail.set('$__utils_archive_tar', new ivm.Reference(async (source, dest, opts) => {
    await utils.archive.tar(source, dest, opts)
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
  await jail.set('$__utils_cache_has', new ivm.Reference(async (id, key) => {
    const handle = cacheHandles.get(id)
    if (!handle) throw new Error(`Invalid cache handle: ${id}`)
    return handle.has(key)
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
    try { return handle.query(sql, params || []) } catch (e) { return Promise.reject(e) }
  }))
  await jail.set('$__utils_sqlite_get', new ivm.Reference(async (id, sql, params) => {
    const handle = sqliteHandles.get(id)
    if (!handle) throw new Error(`Invalid sqlite handle: ${id}`)
    try {
      const row = handle.get(sql, params || [])
      return row !== null ? row : null
    } catch (e) { return Promise.reject(e) }
  }))
  await jail.set('$__utils_sqlite_exec', new ivm.Reference(async (id, sql, params) => {
    const handle = sqliteHandles.get(id)
    if (!handle) throw new Error(`Invalid sqlite handle: ${id}`)
    try { return handle.exec(sql, params || []) } catch (e) { return Promise.reject(e) }
  }))
  await jail.set('$__utils_sqlite_run', new ivm.Reference(async (id, sql) => {
    const handle = sqliteHandles.get(id)
    if (!handle) throw new Error(`Invalid sqlite handle: ${id}`)
    try { handle.run(sql) } catch (e) { return Promise.reject(e) }
  }))
  await jail.set('$__utils_sqlite_close', new ivm.Reference(async (id) => {
    const handle = sqliteHandles.get(id)
    if (!handle) return
    handle.close()
    sqliteHandles.delete(id)
  }))

  await jail.set('$__utils_ws_client', new ivm.Reference((url, options) => {
    return utils.ws.client(url, options)
  }))
  await jail.set('$__utils_ws_on', new ivm.Reference((sessionIdRef, eventRef, callbackRef) => {
    const sessionId = sessionIdRef.copySync()
    const event = eventRef.copySync()
    utils.ws._getSession(sessionId).setHandler(event, callbackRef)
  }))
  await jail.set('$__utils_ws_open', new ivm.Reference(async (sessionId) => {
    await utils.ws._getSession(sessionId).open()
  }))
  await jail.set('$__utils_ws_send_text', new ivm.Reference(async (sessionId, message) => {
    await utils.ws._getSession(sessionId).sendText(message)
  }))
  await jail.set('$__utils_ws_send_binary', new ivm.Reference(async (sessionId, arrayBuffer, byteOffset, byteLength) => {
    await utils.ws._getSession(sessionId).sendBinary(arrayBuffer, byteOffset, byteLength)
  }))
  await jail.set('$__utils_ws_close', new ivm.Reference(async (sessionId) => {
    return utils.ws._getSession(sessionId).close()
  }))
  await jail.set('$__utils_ws_closed', new ivm.Reference(async (sessionId) => {
    return utils.ws._getSession(sessionId).closedPromise
  }))

  await jail.set('$__utils_http_server_create', new ivm.Reference((port, opts) => {
    return utils.http.server(port, opts)
  }))
  await jail.set('$__utils_http_server_set_handler', new ivm.Reference(async (idRef, handlerRef) => {
    const id = typeof idRef === 'object' && idRef !== null && typeof idRef.copySync === 'function' ? idRef.copySync() : idRef
    utils.http._getServerSession(id).setHandler(handlerRef)
  }))
  await jail.set('$__utils_http_server_open', new ivm.Reference(async (idRef) => {
    const id = typeof idRef === 'object' && idRef !== null && typeof idRef.copySync === 'function' ? idRef.copySync() : idRef
    await utils.http._getServerSession(id).open()
    return utils.http._getServerSession(id).port
  }))
  await jail.set('$__utils_http_server_close', new ivm.Reference(async (idRef) => {
    const id = typeof idRef === 'object' && idRef !== null && typeof idRef.copySync === 'function' ? idRef.copySync() : idRef
    await utils.http._getServerSession(id).close()
  }))
  await jail.set('$__utils_http_server_closed', new ivm.Reference(async (idRef) => {
    const id = typeof idRef === 'object' && idRef !== null && typeof idRef.copySync === 'function' ? idRef.copySync() : idRef
    await utils.http._getServerSession(id).closed()
  }))
  await jail.set('$__utils_http_server_request_closed', new ivm.Reference(async (idRef, reqIdRef) => {
    const id = typeof idRef === 'object' && idRef !== null && typeof idRef.copySync === 'function' ? idRef.copySync() : idRef
    const reqId = typeof reqIdRef === 'object' && reqIdRef !== null && typeof reqIdRef.copySync === 'function' ? reqIdRef.copySync() : reqIdRef
    const session = utils.http._getServerSession(id)
    const abort = session.getRequestAbort(reqId)
    if (!abort) return
    return new Promise(resolve => abort.signal.addEventListener('abort', resolve))
  }))

  await jail.set('$__utils_ws_server_create', new ivm.Reference((portOrHttpId, opts, isHttpSession) => {
    const portOrSession = isHttpSession ? utils.http._getServerSession(portOrHttpId) : portOrHttpId
    return utils.ws.server(portOrSession, opts)
  }))
  await jail.set('$__utils_ws_server_set_connection_handler', new ivm.Reference(async (idRef, handlerRef) => {
    const id = typeof idRef === 'object' && idRef !== null && typeof idRef.copySync === 'function' ? idRef.copySync() : idRef
    utils.ws._getWsServerSession(id).setConnectionHandler(handlerRef)
  }))
  await jail.set('$__utils_ws_server_set_error_handler', new ivm.Reference(async (idRef, handlerRef) => {
    const id = typeof idRef === 'object' && idRef !== null && typeof idRef.copySync === 'function' ? idRef.copySync() : idRef
    utils.ws._getWsServerSession(id).setErrorHandler(handlerRef)
  }))
  await jail.set('$__utils_ws_server_open', new ivm.Reference(async (id) => {
    await utils.ws._getWsServerSession(id).open()
    return utils.ws._getWsServerSession(id).port
  }))
  await jail.set('$__utils_ws_server_close', new ivm.Reference(async (id) => {
    await utils.ws._getWsServerSession(id).close()
  }))
  await jail.set('$__utils_ws_server_closed', new ivm.Reference(async (id) => {
    await utils.ws._getWsServerSession(id).closed()
  }))
  await jail.set('$__utils_ws_server_conn_on', new ivm.Reference(async (connIdRef, eventRef, handlerRef) => {
    const connId = typeof connIdRef === 'object' && connIdRef !== null && typeof connIdRef.copySync === 'function' ? connIdRef.copySync() : connIdRef
    const event = typeof eventRef === 'object' && eventRef !== null && typeof eventRef.copySync === 'function' ? eventRef.copySync() : eventRef
    utils.ws._getWsServerConn(connId).setHandler(event, handlerRef)
  }))
  await jail.set('$__utils_ws_server_conn_send_text', new ivm.Reference(async (connId, msg) => {
    await utils.ws._getWsServerConn(connId).sendText(msg)
  }))
  await jail.set('$__utils_ws_server_conn_send_binary', new ivm.Reference(async (connId, ab, byteOffset, byteLength) => {
    await utils.ws._getWsServerConn(connId).sendBinary(ab, byteOffset, byteLength)
  }))
  await jail.set('$__utils_ws_server_conn_close', new ivm.Reference(async (connId, code, reason) => {
    return utils.ws._getWsServerConn(connId).close(code, reason)
  }))
  await jail.set('$__utils_ws_server_conn_closed', new ivm.Reference(async (connId) => {
    return utils.ws._getWsServerConn(connId).closed()
  }))

  const dbHandles = new Map()
  let nextDbHandle = 0

  await jail.set('$__utils_db_connect', new ivm.Reference(async (connectionString) => {
    const handle = await utils.db.connect(connectionString)
    const id = String(nextDbHandle++)
    dbHandles.set(id, handle)
    return id
  }))
  await jail.set('$__utils_db_query', new ivm.Reference(async (id, sql, params) => {
    const handle = dbHandles.get(id)
    if (!handle) throw new Error(`Invalid db handle: ${id}`)
    return handle.query(sql, params || [])
  }))
  await jail.set('$__utils_db_get', new ivm.Reference(async (id, sql, params) => {
    const handle = dbHandles.get(id)
    if (!handle) throw new Error(`Invalid db handle: ${id}`)
    const row = await handle.get(sql, params || [])
    return row !== null ? row : null
  }))
  await jail.set('$__utils_db_exec', new ivm.Reference(async (id, sql, params) => {
    const handle = dbHandles.get(id)
    if (!handle) throw new Error(`Invalid db handle: ${id}`)
    return handle.exec(sql, params || [])
  }))
  await jail.set('$__utils_db_close', new ivm.Reference(async (id) => {
    const handle = dbHandles.get(id)
    if (!handle) return
    await handle.close()
    dbHandles.delete(id)
  }))

  await jail.set('$__utils_crypto_hash', new ivm.Reference((algorithm, data) => {
    return hash(algorithm, data)
  }))
  await jail.set('$__utils_crypto_hash_hex', new ivm.Reference((algorithm, data) => {
    return hashAsHex(algorithm, data)
  }))
  await jail.set('$__utils_crypto_hash_base64', new ivm.Reference((algorithm, data) => {
    return hashAsBase64(algorithm, data)
  }))
  await jail.set('$__utils_crypto_uuid', new ivm.Reference(cryptoUuid))
  await jail.set('$__utils_crypto_random_hex', new ivm.Reference(cryptoHex))
  await jail.set('$__utils_crypto_random_base64', new ivm.Reference(cryptoBase64))
  await jail.set('$__utils_crypto_random_bytes', new ivm.Reference((size) => {
    return randomBytesFn(size)
  }))
  
  await jail.set('$__utils_crypto_hmac', new ivm.Reference((algorithm, key, data) => {
    return hmac(algorithm, key, data)
  }))
  await jail.set('$__utils_crypto_hmac_hex', new ivm.Reference((algorithm, key, data) => {
    return hmacAsHex(algorithm, key, data)
  }))
  await jail.set('$__utils_crypto_hmac_base64', new ivm.Reference((algorithm, key, data) => {
    return hmacAsBase64(algorithm, key, data)
  }))

  await jail.set('$__utils_crypto_encrypt', new ivm.Reference((algorithm, key, iv, data) => {
    return encrypt(algorithm, key, iv, data)
  }))

  await jail.set('$__utils_crypto_decrypt', new ivm.Reference((algorithm, key, iv, ciphertext) => {
    return decrypt(algorithm, key, iv, ciphertext)
  }))

  // Streaming Cryptography Host Bridges
  const hashStates = new Map()
  let nextHashId = 1
  await jail.set('$__utils_crypto_hash_init', new ivm.Reference(async (algorithm) => {
    const { createHash } = await import('node:crypto')
    const h = createHash(algorithm)
    const id = nextHashId++
    hashStates.set(id, h)
    return id
  }))
  await jail.set('$__utils_crypto_hash_update', new ivm.Reference((id, arrayBuffer) => {
    const h = hashStates.get(id)
    if (!h) throw new Error(`Invalid hash stream ID: ${id}`)
    h.update(Buffer.from(arrayBuffer))
  }))
  await jail.set('$__utils_crypto_hash_digest', new ivm.Reference((id) => {
    const h = hashStates.get(id)
    if (!h) throw new Error(`Invalid hash stream ID: ${id}`)
    const digest = h.digest()
    hashStates.delete(id)
    const copy = new Uint8Array(digest.length)
    copy.set(digest)
    return copy.buffer
  }))

  const cipherStates = new Map()
  let nextCipherId = 1
  await jail.set('$__utils_crypto_cipher_init', new ivm.Reference(async (algorithm, keyRef, ivRef, isEncrypt) => {
    const { createCipheriv, createDecipheriv } = await import('node:crypto')
    const key = Buffer.from(keyRef)
    const iv = Buffer.from(ivRef)
    const id = nextCipherId++
    
    let cipher
    let state = { algorithm, key, iv, isEncrypt, bufferedBytes: Buffer.alloc(0) }
    if (isEncrypt) {
      cipher = createCipheriv(algorithm, key, iv)
    } else {
      cipher = createDecipheriv(algorithm, key, iv)
    }
    state.cipher = cipher
    cipherStates.set(id, state)
    return id
  }))
  await jail.set('$__utils_crypto_cipher_update', new ivm.Reference((id, arrayBuffer) => {
    const state = cipherStates.get(id)
    if (!state) throw new Error(`Invalid cipher stream ID: ${id}`)
    const chunk = Buffer.from(arrayBuffer)
    
    if (state.isEncrypt) {
      const out = state.cipher.update(chunk)
      if (out.length === 0) return null
      const copy = new Uint8Array(out.length)
      copy.set(out)
      return copy.buffer
    } else {
      if (state.algorithm.includes('gcm')) {
        const total = Buffer.concat([state.bufferedBytes, chunk])
        if (total.length <= 16) {
          state.bufferedBytes = total
          return null
        }
        const toDecrypt = total.subarray(0, total.length - 16)
        state.bufferedBytes = total.subarray(total.length - 16)
        const out = state.cipher.update(toDecrypt)
        if (out.length === 0) return null
        const copy = new Uint8Array(out.length)
        copy.set(out)
        return copy.buffer
      } else {
        const out = state.cipher.update(chunk)
        if (out.length === 0) return null
        const copy = new Uint8Array(out.length)
        copy.set(out)
        return copy.buffer
      }
    }
  }))
  await jail.set('$__utils_crypto_cipher_final', new ivm.Reference((id) => {
    const state = cipherStates.get(id)
    if (!state) throw new Error(`Invalid cipher stream ID: ${id}`)
    
    let finalParts = []
    if (!state.isEncrypt && state.algorithm.includes('gcm')) {
      if (state.bufferedBytes.length < 16) {
        throw new Error('Streaming GCM Decrypt: Ciphertext too short to contain auth tag')
      }
      state.cipher.setAuthTag(state.bufferedBytes)
    }
    
    finalParts.push(state.cipher.final())
    
    if (state.isEncrypt && state.algorithm.includes('gcm')) {
      finalParts.push(state.cipher.getAuthTag())
    }
    
    cipherStates.delete(id)
    const merged = Buffer.concat(finalParts)
    if (merged.length === 0) return null
    const copy = new Uint8Array(merged.length)
    copy.set(merged)
    return copy.buffer
  }))

  // Streaming Archive Host Bridges
  await jail.set('$__utils_archive_zipStream', new ivm.Reference(async (source) => {
    const stream = utils.archive.zipStream(source)
    const iter = stream[Symbol.asyncIterator]()
    const id = nextStreamId++
    streams.set(id, iter)
    return id
  }))
  await jail.set('$__utils_archive_tarStream', new ivm.Reference(async (source, optsRef) => {
    const opts = optsRef ? optsRef.copySync() : undefined
    const stream = await utils.archive.tarStream(source, opts)
    const iter = stream[Symbol.asyncIterator]()
    const id = nextStreamId++
    streams.set(id, iter)
    return id
  }))
  await jail.set('$__utils_archive_unzipStream', new ivm.Reference(async (dest) => {
    const writeStream = utils.archive.unzipStream(dest)
    const id = nextStreamId++
    streams.set(id, writeStream)
    return id
  }))
  await jail.set('$__utils_archive_untarStream', new ivm.Reference(async (dest, optsRef) => {
    const opts = optsRef ? optsRef.copySync() : undefined
    const writeStream = await utils.archive.untarStream(dest, opts)
    const id = nextStreamId++
    streams.set(id, writeStream)
    return id
  }))

  await jail.set('$__vars', JSON.stringify(vars))
  await jail.set('$__projectDir', projectDir)
  await jail.set('$__help_text', helpText ?? null)

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

async function injectConsole(isolate, context, onEvent) {
  const jail = context.global
  if (onEvent) {
    await jail.set('$__utils_console_emit', new ivm.Reference((level, ...args) => {
      onEvent({ type: 'log', level, message: args.join(' ') })
    }))
    await jail.set('$__utils_logger_emit', new ivm.Reference((level, message, meta) => {
      onEvent({ type: 'log', level, message, ...(meta != null ? { meta } : {}) })
    }))
  } else {
    await jail.set('$__utils_console_emit', new ivm.Reference((level, ...args) => {
      process.stderr.write(args.join(' ') + '\n')
    }))
    await jail.set('$__utils_logger_emit', new ivm.Reference((level, message) => {
      process.stderr.write(`[${level}] ${message}\n`)
    }))
  }

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
  lifecycle = 'run',
  pluginId = null,
  runeKey = null,
  onEvent = null,
  instanceId = '1',
} = {}) {
  const wrappedOnEvent = onEvent ? (event) => onEvent({ ...event, instanceId, rune: runeKey }) : null
  const augmented = {
    allow: [...effective.allow, ...getAutoPermits({ pluginId, pluginDir })],
    deny: effective.deny,
  }
  const { id: projectId } = await ensureProjectIdentity(projectDir)
  const checkPermission = makePermissionChecker(augmented, { dir: projectDir, pluginId, pluginDir, projectId })
  const { utils, dispose } = createUtils(projectDir, checkPermission, pluginDir ?? null, augmented, vars, sections, pluginId)

  if (isVerbose) console.error(`[crunes:debug] creating Isolate...`)
  const isolate = new ivm.Isolate({ memoryLimit: isolateMemoryMb })
  let context
  try {
    if (isVerbose) console.error(`[crunes:debug] creating Context...`)
    context = await isolate.createContext()

    if (isVerbose) console.error(`[crunes:debug] injecting $__hostRequire...`)
    await context.global.set('$__hostRequire', new ivm.Reference((spec) => {
      const msg = DENY_BUILTINS.get(spec) ?? `Sandbox escape blocked. Cannot require '${spec}' on host.`
      throw new Error(`PermissionError: ${msg}`)
    }))

    if (isVerbose) console.error(`[crunes:debug] injecting utils and console...`)
    let helpText = null
    if (lifecycle === 'run') {
      try {
        const schema = await getArgsSchema(runeFile, effective, projectDir, { vars, nodeModulesDir, pluginDeps, pluginDir, pluginId })
        const entry = { name: runeKey, description: undefined }
        helpText = formatHelp(schema, { key: runeKey, name: entry.name, description: entry.description })
      } catch { /* help unavailable, silently skip */ }
    }
    const utilsMod = await injectUtils(isolate, context, utils, runeCallback, vars, projectDir, checkPermission, runeKey, sections, wrappedOnEvent, helpText)
    await injectConsole(isolate, context, wrappedOnEvent)

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
    assertNoDynamicImport(runeSrc, runeFile)
    const exportBinding = `\nif (typeof ${lifecycle} !== "undefined") globalThis.__crunes_target = ${lifecycle};\nif (typeof args !== "undefined") globalThis.__crunes_args = args;\nif (typeof dispose !== "undefined") globalThis.__crunes_dispose = dispose;\n`
    const patchedSrc = runeSrc + exportBinding
    if (isVerbose) console.error(`[crunes:debug] compiling Module...`)
    const runeMod    = await isolate.compileModule(patchedSrc, { filename: runeFile })

    const { resolve, register } = createModuleResolver(
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
    register(runeMod, runeFile)
    if (isVerbose) console.error(`[crunes:debug] instantiating Module...`)
    await runeMod.instantiate(context, resolve)
    
    if (isVerbose) console.error(`[crunes:debug] evaluating Module...`)
    await runeMod.evaluate(isolateTimeoutMs !== undefined ? { timeout: isolateTimeoutMs } : {})

    // Builtin proxy modules have now been evaluated — remove the host require bridge.
    if (isVerbose) console.error(`[crunes:debug] cleaning up $__hostRequire...`)
    await context.eval('delete globalThis.$__hostRequire')
    // Extract args schema from rune if it exports args(), then parse on host.
    // use(args) always receives a parsed args object; args._ holds data positionals (command tokens stripped), args.$raw holds the original array.
    let parsedArgs
    if (await context.eval('typeof __crunes_args !== "undefined"')) {
      const schema = await context.evalClosure(
        `return (async () => {
          const b = (() => {
            const opts = [], pos = [], exs = [], cmds = []
            const createBuilder = (subName, subDesc) => {
              const sOpts = [], sPos = [], sExs = [], sCmds = []
              const subBuilder = {
                option(flags, description, def) { sOpts.push({ flags, description, def }); return subBuilder },
                positional(spec, description)   { sPos.push({ spec, description }); return subBuilder },
                example(usage, description)     { sExs.push({ usage, description }); return subBuilder },
                command(name, description, callback) {
                  const nestedBuilder = createBuilder(name, description)
                  if (typeof callback === 'function') {
                    callback(nestedBuilder)
                  }
                  sCmds.push(nestedBuilder.build())
                  return subBuilder
                },
                build() { return { name: subName, description: subDesc, options: sOpts, positionals: sPos, examples: sExs, commands: sCmds } }
              }
              return subBuilder
            }
            const rootBuilder = {
              option(flags, description, def) { opts.push({ flags, description, def }); return rootBuilder },
              positional(spec, description)   { pos.push({ spec, description }); return rootBuilder },
              example(usage, description)     { exs.push({ usage, description }); return rootBuilder },
              command(name, description, callback) {
                const subBuilder = createBuilder(name, description)
                if (typeof callback === 'function') {
                  callback(subBuilder)
                }
                cmds.push(subBuilder.build())
                return rootBuilder
              },
              build() { return { options: opts, positionals: pos, examples: exs, commands: cmds } }
            }
            return rootBuilder
          })()
          const res = await __crunes_args(b)
          return (res && typeof res.build === 'function') ? res.build() : res
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
    if (await context.eval('typeof __crunes_dispose !== "undefined"').catch(() => false)) {
      await context.evalClosure(
        `return (async () => { await __crunes_dispose() })()`,
        [],
        { result: { promise: true, copy: true } }
      ).catch(() => {})
    }
    await dispose()
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
    lifecycle:        opts.lifecycle ?? 'run',
    runeKey,
    onEvent:          opts.onEvent ?? null,
    instanceId:       opts.instanceId ?? '1',
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
  const checkPermission = makePermissionChecker(augmented, { dir: projectDir })
  const { utils, dispose } = createUtils(projectDir, checkPermission, pluginDir ?? null, augmented, vars, null, null)
  const isolate = new ivm.Isolate({ memoryLimit: isolateMemoryMb })
  try {
    const context = await isolate.createContext()
    await context.global.set('$__hostRequire', new ivm.Reference((spec) => {
      const msg = DENY_BUILTINS.get(spec) ?? `Sandbox escape blocked. Cannot require '${spec}' on host.`
      throw new Error(`PermissionError: ${msg}`)
    }))
    const utilsMod = await injectUtils(isolate, context, utils, null, vars, projectDir, checkPermission, null, null, null)
    await injectConsole(isolate, context, null)
    if (pluginDir != null) await context.global.set('CRUNES_PLUGIN_ROOT', pluginDir)

    const runeSrc = await fs.readFile(runeFile, 'utf8')
    assertNoDynamicImport(runeSrc, runeFile)
    const patchedSrc = runeSrc + '\nif (typeof args !== "undefined") globalThis.__crunes_args = args;\n'
    const runeMod = await isolate.compileModule(patchedSrc, { filename: runeFile })
    const { resolve, register } = createModuleResolver(
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
    register(runeMod, runeFile)
    await runeMod.instantiate(context, resolve)
    await runeMod.evaluate({ timeout: isolateTimeoutMs })
    await context.eval('delete globalThis.$__hostRequire')

    const hasArgsExport = await context.eval('typeof __crunes_args !== "undefined"')
    if (!hasArgsExport) return null

    const schema = await context.evalClosure(
      `return (async () => {
        const b = (() => {
          const opts = [], pos = [], exs = [], cmds = []
          const createBuilder = (subName, subDesc) => {
            const sOpts = [], sPos = [], sExs = [], sCmds = []
            const subBuilder = {
              option(flags, description, def) { sOpts.push({ flags, description, def }); return subBuilder },
              positional(spec, description)   { sPos.push({ spec, description }); return subBuilder },
              example(usage, description)     { sExs.push({ usage, description }); return subBuilder },
              command(name, description, callback) {
                const nestedBuilder = createBuilder(name, description)
                if (typeof callback === 'function') {
                  callback(nestedBuilder)
                }
                sCmds.push(nestedBuilder.build())
                return subBuilder
              },
              build() { return { name: subName, description: subDesc, options: sOpts, positionals: sPos, examples: sExs, commands: sCmds } }
            }
            return subBuilder
          }
          const rootBuilder = {
            option(flags, description, def) { opts.push({ flags, description, def }); return rootBuilder },
            positional(spec, description)   { pos.push({ spec, description }); return rootBuilder },
            example(usage, description)     { exs.push({ usage, description }); return rootBuilder },
            command(name, description, callback) {
              const subBuilder = createBuilder(name, description)
              if (typeof callback === 'function') {
                callback(subBuilder)
              }
              cmds.push(subBuilder.build())
              return rootBuilder
            },
            build() { return { options: opts, positionals: pos, examples: exs, commands: cmds } }
          }
          return rootBuilder
        })()
        const res = await __crunes_args(b)
        return (res && typeof res.build === 'function') ? res.build() : res
      })()`,
      [],
      { timeout: isolateTimeoutMs, result: { promise: true, copy: true } }
    )
    return schema
  } finally {
    await dispose()
    isolate.dispose()
  }
}

export async function getReplSchema(runeFile, effective, args, projectDir, {
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
  const checkPermission = makePermissionChecker(augmented, { dir: projectDir })
  const { utils, dispose } = createUtils(projectDir, checkPermission, pluginDir ?? null, augmented, vars, null, null)
  const isolate = new ivm.Isolate({ memoryLimit: isolateMemoryMb })
  try {
    const context = await isolate.createContext()
    await context.global.set('$__hostRequire', new ivm.Reference((spec) => {
      const msg = DENY_BUILTINS.get(spec) ?? `Sandbox escape blocked. Cannot require '${spec}' on host.`
      throw new Error(`PermissionError: ${msg}`)
    }))
    const utilsMod = await injectUtils(isolate, context, utils, null, vars, projectDir, checkPermission, null, null, null)
    await injectConsole(isolate, context, null)
    if (pluginDir != null) await context.global.set('CRUNES_PLUGIN_ROOT', pluginDir)

    const runeSrc = await fs.readFile(runeFile, 'utf8')
    assertNoDynamicImport(runeSrc, runeFile)
    const patchedSrc = runeSrc +
      '\nif (typeof argsRepl !== "undefined") globalThis.__crunes_argsRepl = argsRepl;\n' +
      '\nif (typeof commandsRepl !== "undefined") globalThis.__crunes_commandsRepl = commandsRepl;\n'
    const runeMod = await isolate.compileModule(patchedSrc, { filename: runeFile })
    const { resolve, register } = createModuleResolver(
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
    register(runeMod, runeFile)
    await runeMod.instantiate(context, resolve)
    await runeMod.evaluate({ timeout: isolateTimeoutMs })
    await context.eval('delete globalThis.$__hostRequire')

    // Extract argsRepl schema
    let argsSchema = null
    if (await context.eval('typeof __crunes_argsRepl !== "undefined"')) {
      argsSchema = await context.evalClosure(
        `return (async () => {
          const b = (() => {
            const opts = [], pos = [], exs = [], cmds = []
            const createBuilder = (subName, subDesc) => {
              const sOpts = [], sPos = [], sExs = [], sCmds = []
              const subBuilder = {
                option(flags, description, def) { sOpts.push({ flags, description, def }); return subBuilder },
                positional(spec, description)   { sPos.push({ spec, description }); return subBuilder },
                example(usage, description)     { sExs.push({ usage, description }); return subBuilder },
                command(name, description, callback) {
                  const nestedBuilder = createBuilder(name, description)
                  if (typeof callback === 'function') callback(nestedBuilder)
                  sCmds.push(nestedBuilder.build())
                  return subBuilder
                },
                build() { return { name: subName, description: subDesc, options: sOpts, positionals: sPos, examples: sExs, commands: sCmds } }
              }
              return subBuilder
            }
            const rootBuilder = {
              option(flags, description, def) { opts.push({ flags, description, def }); return rootBuilder },
              positional(spec, description)   { pos.push({ spec, description }); return rootBuilder },
              example(usage, description)     { exs.push({ usage, description }); return rootBuilder },
              command(name, description, callback) {
                const subBuilder = createBuilder(name, description)
                if (typeof callback === 'function') callback(subBuilder)
                cmds.push(subBuilder.build())
                return rootBuilder
              },
              build() { return { options: opts, positionals: pos, examples: exs, commands: cmds } }
            }
            return rootBuilder
          })()
          const res = await __crunes_argsRepl(b)
          return (res && typeof res.build === 'function') ? res.build() : res
        })()`,
        [],
        { timeout: isolateTimeoutMs, result: { promise: true, copy: true } }
      )
    }

    // Extract commandsRepl schema (root .option/.positional/.example are no-ops)
    let commandsSchema = null
    if (await context.eval('typeof __crunes_commandsRepl !== "undefined"')) {
      commandsSchema = await context.evalClosure(
        `return (async () => {
          const b = (() => {
            const cmds = []
            const createBuilder = (subName, subDesc) => {
              const sOpts = [], sPos = [], sExs = [], sCmds = []
              const subBuilder = {
                option(flags, description, def) { sOpts.push({ flags, description, def }); return subBuilder },
                positional(spec, description)   { sPos.push({ spec, description }); return subBuilder },
                example(usage, description)     { sExs.push({ usage, description }); return subBuilder },
                command(name, description, callback) {
                  const nestedBuilder = createBuilder(name, description)
                  if (typeof callback === 'function') callback(nestedBuilder)
                  sCmds.push(nestedBuilder.build())
                  return subBuilder
                },
                build() { return { name: subName, description: subDesc, options: sOpts, positionals: sPos, examples: sExs, commands: sCmds } }
              }
              return subBuilder
            }
            const rootBuilder = {
              option() { return rootBuilder },
              positional() { return rootBuilder },
              example() { return rootBuilder },
              command(name, description, callback) {
                const subBuilder = createBuilder(name, description)
                if (typeof callback === 'function') callback(subBuilder)
                cmds.push(subBuilder.build())
                return rootBuilder
              },
              build() { return { commands: cmds } }
            }
            return rootBuilder
          })()
          const res = await __crunes_commandsRepl(b)
          return (res && typeof res.build === 'function') ? res.build() : res
        })()`,
        [],
        { timeout: isolateTimeoutMs, result: { promise: true, copy: true } }
      )
    }

    return { argsSchema, commandsSchema }
  } finally {
    await dispose()
    isolate.dispose()
  }
}

/**
 * Compute effective permissions and run a plugin rune. Convenience wrapper for core.js.
 */
export async function executePluginRune({ pluginDir, pluginCacheDir, runeKey, pluginJson, projectPerms, projectVars = {}, args, projectDir, opts, runeCallback, sections, lifecycle = 'run', onEvent = null, instanceId = '1', }) {
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
    onEvent,
    instanceId,
  })
}

/**
 * Boot a rune isolate for interactive REPL use. The isolate stays alive
 * across calls. Returns { step, dispose }.
 *
 * step(input)  — calls repl(parsedArgs, input) inside the isolate,
 *                collects onEvent events, returns the raw return value.
 * dispose()    — tears down the isolate and cleans up utils resources.
 */
export async function runRuneInRepl(runeFile, effective, args, projectDir, {
  nodeModulesDir = null,
  pluginDeps = {},
  pluginDir = null,
  isolateMemoryMb = 128,
  vars = {},
  pluginId = null,
  runeKey = null,
  onEvent = null,
  instanceId = '1',
} = {}) {
  const wrappedOnEvent = onEvent ? (event) => onEvent({ ...event, instanceId, rune: runeKey }) : null
  const augmented = {
    allow: [...effective.allow, ...getAutoPermits({ pluginId, pluginDir })],
    deny: effective.deny,
  }
  const { id: projectId } = await ensureProjectIdentity(projectDir)
  const checkPermission = makePermissionChecker(augmented, { dir: projectDir, pluginId, pluginDir, projectId })
  const { utils, dispose: disposeUtils } = createUtils(projectDir, checkPermission, pluginDir ?? null, augmented, vars, null, pluginId)

  const isolate = new ivm.Isolate({ memoryLimit: isolateMemoryMb })
  const context = await isolate.createContext()

  await context.global.set('$__hostRequire', new ivm.Reference((spec) => {
    const msg = DENY_BUILTINS.get(spec) ?? `Sandbox escape blocked. Cannot require '${spec}' on host.`
    throw new Error(`PermissionError: ${msg}`)
  }))

  let helpText = null
  try {
    const { argsSchema } = await getReplSchema(runeFile, effective, [], projectDir, { vars, nodeModulesDir, pluginDeps, pluginDir })
    if (argsSchema) helpText = formatHelp(argsSchema, { key: runeKey, name: runeKey, description: undefined, lifecycle: 'repl' })
  } catch { /* help unavailable, silently skip */ }

  const utilsMod = await injectUtils(isolate, context, utils, null, vars, projectDir, checkPermission, runeKey, null, wrappedOnEvent, helpText)
  await injectConsole(isolate, context, wrappedOnEvent)

  if (pluginDir != null) await context.global.set('CRUNES_PLUGIN_ROOT', pluginDir)

  const runeSrc = await fs.readFile(runeFile, 'utf8')
  assertNoDynamicImport(runeSrc, runeFile)
  const patchedSrc = runeSrc +
    '\nif (typeof repl !== "undefined") globalThis.__crunes_repl = repl;\n' +
    '\nif (typeof argsRepl !== "undefined") globalThis.__crunes_argsRepl = argsRepl;\n' +
    '\nif (typeof inputRepl !== "undefined") globalThis.__crunes_inputRepl = inputRepl;\n' +
    '\nif (typeof bannerRepl !== "undefined") globalThis.__crunes_bannerRepl = bannerRepl;\n' +
    '\nif (typeof commandsRepl !== "undefined") globalThis.__crunes_commandsRepl = commandsRepl;\n' +
    '\nif (typeof completeInputRepl !== "undefined") globalThis.__crunes_completeInputRepl = completeInputRepl;\n' +
    '\nif (typeof disposeRepl !== "undefined") globalThis.__crunes_disposeRepl = disposeRepl;\n'

  const runeMod = await isolate.compileModule(patchedSrc, { filename: runeFile })
  const { resolve, register } = createModuleResolver(
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
  register(runeMod, runeFile)
  await runeMod.instantiate(context, resolve)
  await runeMod.evaluate()
  await context.eval('delete globalThis.$__hostRequire')

  const hasRunRepl   = await context.eval('typeof __crunes_repl !== "undefined"')
  const hasInputRepl = await context.eval('typeof __crunes_inputRepl !== "undefined"')
  if (!hasRunRepl && !hasInputRepl) {
    await disposeUtils()
    isolate.dispose()
    throw new Error(`Rune "${runeFile}" must export repl() or inputRepl() (or both).`)
  }

  // Parse argsRepl schema if exported, else no schema
  let parsedArgs
  if (await context.eval('typeof __crunes_argsRepl !== "undefined"')) {
    const schema = await context.evalClosure(
      `return (async () => {
        const b = (() => {
          const opts = [], pos = [], exs = [], cmds = []
          const createBuilder = (subName, subDesc) => {
            const sOpts = [], sPos = [], sExs = [], sCmds = []
            const subBuilder = {
              option(flags, description, def) { sOpts.push({ flags, description, def }); return subBuilder },
              positional(spec, description)   { sPos.push({ spec, description }); return subBuilder },
              example(usage, description)     { sExs.push({ usage, description }); return subBuilder },
              command(name, description, callback) {
                const nestedBuilder = createBuilder(name, description)
                if (typeof callback === 'function') callback(nestedBuilder)
                sCmds.push(nestedBuilder.build())
                return subBuilder
              },
              build() { return { name: subName, description: subDesc, options: sOpts, positionals: sPos, examples: sExs, commands: sCmds } }
            }
            return subBuilder
          }
          const rootBuilder = {
            option(flags, description, def) { opts.push({ flags, description, def }); return rootBuilder },
            positional(spec, description)   { pos.push({ spec, description }); return rootBuilder },
            example(usage, description)     { exs.push({ usage, description }); return rootBuilder },
            command(name, description, callback) {
              const subBuilder = createBuilder(name, description)
              if (typeof callback === 'function') callback(subBuilder)
              cmds.push(subBuilder.build())
              return rootBuilder
            },
            build() { return { options: opts, positionals: pos, examples: exs, commands: cmds } }
          }
          return rootBuilder
        })()
        const res = await __crunes_argsRepl(b)
        return (res && typeof res.build === 'function') ? res.build() : res
      })()`,
      [],
      { timeout: 30_000, result: { promise: true, copy: true } }
    )
    parsedArgs = parseArgs(args, schema)
  } else {
    parsedArgs = parseArgs(args, null)
  }

  // Call repl(args) once as session initializer — captures initial prompt
  let initialPrompt = null
  if (hasRunRepl) {
    const initResult = await context.evalClosure(
      `return (async () => { return await __crunes_repl($0) })()`,
      [parsedArgs],
      { arguments: { copy: true }, result: { promise: true, copy: true } }
    )
    if (typeof initResult === 'string') initialPrompt = initResult
  }

  // Call bannerRepl(args) once after repl — captures banner text
  let banner = null
  if (await context.eval('typeof __crunes_bannerRepl !== "undefined"')) {
    const bannerResult = await context.evalClosure(
      `return (async () => { return await __crunes_bannerRepl($0) })()`,
      [parsedArgs],
      { arguments: { copy: true }, result: { promise: true, copy: true } }
    )
    if (typeof bannerResult === 'string') banner = bannerResult
  }

  // Extract commandsRepl schema (same inline builder pattern as argsRepl)
  let commandsSchema = null
  if (await context.eval('typeof __crunes_commandsRepl !== "undefined"')) {
    commandsSchema = await context.evalClosure(
      `return (async () => {
        const b = (() => {
          const cmds = []
          const createBuilder = (subName, subDesc) => {
            const sOpts = [], sPos = [], sExs = [], sCmds = []
            const subBuilder = {
              option(flags, description, def) { sOpts.push({ flags, description, def }); return subBuilder },
              positional(spec, description)   { sPos.push({ spec, description }); return subBuilder },
              example(usage, description)     { sExs.push({ usage, description }); return subBuilder },
              command(name, description, callback) {
                const nestedBuilder = createBuilder(name, description)
                if (typeof callback === 'function') callback(nestedBuilder)
                sCmds.push(nestedBuilder.build())
                return subBuilder
              },
              build() { return { name: subName, description: subDesc, options: sOpts, positionals: sPos, examples: sExs, commands: sCmds } }
            }
            return subBuilder
          }
          const rootBuilder = {
            option() { return rootBuilder },
            positional() { return rootBuilder },
            example() { return rootBuilder },
            command(name, description, callback) {
              const subBuilder = createBuilder(name, description)
              if (typeof callback === 'function') callback(subBuilder)
              cmds.push(subBuilder.build())
              return rootBuilder
            },
            build() { return { commands: cmds } }
          }
          return rootBuilder
        })()
        const res = await __crunes_commandsRepl(b)
        return (res && typeof res.build === 'function') ? res.build() : res
      })()`,
      [],
      { timeout: 30_000, result: { promise: true, copy: true } }
    )
  }

  const hasComplete = await context.eval('typeof __crunes_completeInputRepl !== "undefined"')

  async function step(input) {
    return context.evalClosure(
      `return (async () => { return await __crunes_inputRepl($0) })()`,
      [input],
      { arguments: { copy: true }, result: { promise: true, copy: true } }
    )
  }

  async function complete(tokens) {
    return context.evalClosure(
      `return (async () => { return await __crunes_completeInputRepl($0) })()`,
      [tokens],
      { arguments: { copy: true }, result: { promise: true, copy: true } }
    )
  }

  const hasDisposeRepl = await context.eval('typeof __crunes_disposeRepl !== "undefined"')

  async function dispose() {
    if (hasDisposeRepl) {
      await context.evalClosure(
        `return (async () => { await __crunes_disposeRepl() })()`,
        [],
        { result: { promise: true, copy: true } }
      ).catch(() => {})
    }
    await disposeUtils()
    isolate.dispose()
  }

  return { initialPrompt, banner, commandsSchema, step, complete: hasComplete ? complete : null, dispose }
}
