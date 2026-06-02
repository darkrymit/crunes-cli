// Assembled inside the V8 isolate. Imports from pre-compiled isolate modules for
// md and tree; wires host-side Reference callbacks for fs, shell, and section.
// $__utils_* globals are injected by the host before this module is evaluated.

import * as md from 'crunes:md'
import * as tree from 'crunes:tree'

const __vars = JSON.parse($__vars)

import { TextEncoder, TextDecoder } from 'fast-text-encoding'
import { ReadableStream, WritableStream, TransformStream, ByteLengthQueuingStrategy, CountQueuingStrategy } from 'web-streams-polyfill'

globalThis.ReadableStream = ReadableStream
globalThis.WritableStream = WritableStream
globalThis.TransformStream = TransformStream
globalThis.ByteLengthQueuingStrategy = ByteLengthQueuingStrategy
globalThis.CountQueuingStrategy = CountQueuingStrategy

class AbortSignal {
  constructor() {
    this.aborted = false
    this._listeners = []
  }
  addEventListener(type, listener) {
    if (type === 'abort') this._listeners.push(listener)
  }
  removeEventListener(type, listener) {
    if (type === 'abort') this._listeners = this._listeners.filter(l => l !== listener)
  }
  dispatchEvent(event) {
    if (event.type === 'abort') {
      this.aborted = true
      for (const listener of this._listeners) {
        try { listener(event) } catch (e) {}
      }
    }
  }
}

class AbortController {
  constructor() {
    this.signal = new AbortSignal()
  }
  abort() {
    if (!this.signal.aborted) {
      this.signal.dispatchEvent({ type: 'abort' })
    }
  }
}

globalThis.TextEncoder = TextEncoder
globalThis.TextDecoder = TextDecoder
globalThis.AbortController = AbortController
globalThis.AbortSignal = AbortSignal
AbortSignal.timeout = (ms) => {
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

class Blob {
  constructor(parts = [], { type = '' } = {}) {
    this.type = type
    const chunks = []
    for (const part of parts) {
      if (typeof part === 'string') {
        chunks.push(new TextEncoder().encode(part))
      } else if (part instanceof Uint8Array) {
        chunks.push(part)
      } else if (part instanceof Blob) {
        chunks.push(part._bytes)
      } else if (part instanceof ArrayBuffer) {
        chunks.push(new Uint8Array(part))
      } else {
        chunks.push(new TextEncoder().encode(String(part)))
      }
    }
    let totalLen = 0
    for (const c of chunks) totalLen += c.length
    const combined = new Uint8Array(totalLen)
    let offset = 0
    for (const c of chunks) { combined.set(c, offset); offset += c.length }
    this._bytes = combined
  }
  get size() { return this._bytes.length }
  async text() { return new TextDecoder().decode(this._bytes) }
  async arrayBuffer() { return this._bytes.buffer.slice(this._bytes.byteOffset, this._bytes.byteOffset + this._bytes.byteLength) }
  slice(start = 0, end = this._bytes.length, contentType = '') {
    return new Blob([this._bytes.slice(start, end)], { type: contentType })
  }
}
globalThis.Blob = Blob

class Headers {
  constructor(init) {
    this._map = new Map()
    if (init instanceof Headers) {
      for (const [k, v] of init._map) this._map.set(k, v)
    } else if (Array.isArray(init)) {
      for (const [k, v] of init) this._map.set(k.toLowerCase(), v)
    } else if (init && typeof init === 'object') {
      for (const [k, v] of Object.entries(init)) this._map.set(k.toLowerCase(), String(v))
    }
  }
  get(name) { return this._map.get(name.toLowerCase()) ?? null }
  set(name, value) { this._map.set(name.toLowerCase(), String(value)) }
  has(name) { return this._map.has(name.toLowerCase()) }
  append(name, value) {
    const key = name.toLowerCase()
    const existing = this._map.get(key)
    this._map.set(key, existing != null ? `${existing}, ${value}` : String(value))
  }
  delete(name) { this._map.delete(name.toLowerCase()) }
  entries() { return this._map.entries() }
  keys() { return this._map.keys() }
  values() { return this._map.values() }
  forEach(fn) { this._map.forEach((v, k) => fn(v, k)) }
  [Symbol.iterator]() { return this._map.entries() }
}
globalThis.Headers = Headers

class FormData {
  constructor() { this._entries = [] }
  append(name, value, filename) {
    this._entries.push({ name, value, filename })
  }
  get(name) {
    const entry = this._entries.find(e => e.name === name)
    return entry ? entry.value : null
  }
  getAll(name) { return this._entries.filter(e => e.name === name).map(e => e.value) }
  has(name) { return this._entries.some(e => e.name === name) }
  set(name, value, filename) {
    const idx = this._entries.findIndex(e => e.name === name)
    if (idx !== -1) { this._entries.splice(idx, 1, { name, value, filename }) }
    else { this._entries.push({ name, value, filename }) }
  }
  delete(name) { this._entries = this._entries.filter(e => e.name !== name) }
  entries() { return this._entries.map(e => [e.name, e.value])[Symbol.iterator]() }
  _toWire() {
    const boundary = '----CrunesFormBoundary' + Math.random().toString(36).slice(2)
    const parts = this._entries.map(e => ({
      name: e.name,
      filename: e.filename ?? null,
      value: e.value instanceof Blob
        ? { type: 'Buffer', data: Array.from(e.value._bytes), contentType: e.value.type || 'application/octet-stream' }
        : e.value instanceof Uint8Array
          ? { type: 'Buffer', data: Array.from(e.value), contentType: 'application/octet-stream' }
          : e.value,
    }))
    return { type: 'FormData', boundary, parts }
  }
}
globalThis.FormData = FormData

class URLSearchParams {
  constructor(init) {
    this._params = []
    if (typeof init === 'string') {
      const s = init.startsWith('?') ? init.slice(1) : init
      for (const pair of s.split('&')) {
        if (!pair) continue
        const eq = pair.indexOf('=')
        if (eq === -1) { this._params.push([decodeURIComponent(pair), '']) }
        else { this._params.push([decodeURIComponent(pair.slice(0, eq)), decodeURIComponent(pair.slice(eq + 1))]) }
      }
    } else if (Array.isArray(init)) {
      for (const [k, v] of init) this._params.push([k, v])
    } else if (init && typeof init === 'object') {
      for (const [k, v] of Object.entries(init)) this._params.push([k, String(v)])
    }
  }
  append(name, value) { this._params.push([name, String(value)]) }
  get(name) { return (this._params.find(([k]) => k === name) ?? [null, null])[1] }
  getAll(name) { return this._params.filter(([k]) => k === name).map(([, v]) => v) }
  has(name) { return this._params.some(([k]) => k === name) }
  set(name, value) {
    const idx = this._params.findIndex(([k]) => k === name)
    if (idx !== -1) {
      this._params = this._params.filter(([k]) => k !== name)
      this._params.splice(idx, 0, [name, String(value)])
    } else {
      this._params.push([name, String(value)])
    }
  }
  delete(name) { this._params = this._params.filter(([k]) => k !== name) }
  toString() {
    return this._params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  }
  entries() { return this._params[Symbol.iterator]() }
  keys() { return this._params.map(([k]) => k)[Symbol.iterator]() }
  values() { return this._params.map(([, v]) => v)[Symbol.iterator]() }
  [Symbol.iterator]() { return this._params[Symbol.iterator]() }
}
globalThis.URLSearchParams = URLSearchParams

class TextEncoderStream {
  constructor() {
    const encoder = new TextEncoder()
    const transform = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(encoder.encode(chunk))
      }
    })
    this.readable = transform.readable
    this.writable = transform.writable
  }
}

class TextDecoderStream {
  constructor(label = 'utf-8', options = {}) {
    const decoder = new TextDecoder(label, options)
    const transform = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(decoder.decode(chunk))
      },
      flush(controller) {
        const remaining = decoder.decode(new Uint8Array(0))
        if (remaining) controller.enqueue(remaining)
      }
    })
    this.readable = transform.readable
    this.writable = transform.writable
  }
}

globalThis.TextEncoderStream = TextEncoderStream
globalThis.TextDecoderStream = TextDecoderStream

class Request {
  constructor(input, init = {}) {
    if (input instanceof Request) {
      this.url = input.url
      this.method = input.method
      this.headers = new Headers(input.headers)
      this._body = input._body
      this._bodyUsed = false
    } else {
      this.url = String(input)
      this.method = (init.method ?? 'GET').toUpperCase()
      this.headers = new Headers(init.headers)
      this._body = init.body ?? null
      this._bodyUsed = false
    }
    if (init.method) this.method = init.method.toUpperCase()
    if (init.headers) { for (const [k, v] of new Headers(init.headers)) this.headers.set(k, v) }
    if (init.body !== undefined) { this._body = init.body; this._bodyUsed = false }
  }
  get body() {
    if (this._body instanceof ReadableStream) return this._body
    if (this._body == null) return null
    const bytes = this._body instanceof Blob
      ? this._body._bytes
      : this._body instanceof Uint8Array
        ? this._body
        : new TextEncoder().encode(String(this._body))
    return new ReadableStream({ start(c) { c.enqueue(bytes); c.close() } })
  }
  get bodyUsed() { return this._bodyUsed }
  _consume() {
    if (this._body != null && this._bodyUsed) throw new TypeError('body already used')
    if (this._body != null) this._bodyUsed = true
  }
  async text() {
    this._consume()
    if (this._body == null) return ''
    if (this._body instanceof Blob) return this._body.text()
    if (this._body instanceof Uint8Array) return new TextDecoder().decode(this._body)
    return String(this._body)
  }
  async json() { return JSON.parse(await this.text()) }
  async blob() {
    this._consume()
    if (this._body == null) return new Blob([], { type: '' })
    if (this._body instanceof Blob) return this._body
    if (this._body instanceof Uint8Array) return new Blob([this._body])
    return new Blob([new TextEncoder().encode(String(this._body))])
  }
}
globalThis.Request = Request

class Response {
  constructor(body = null, init = {}) {
    this.status = init.status ?? 200
    this.statusText = init.statusText ?? ''
    this.headers = new Headers(init.headers)
    this.ok = this.status >= 200 && this.status < 300
    this._body = body ?? null
    this._bodyUsed = false
  }
  get bodyUsed() { return this._bodyUsed }
  get body() {
    if (this._body == null) return null
    if (this._body instanceof ReadableStream) return this._body
    const bytes = this._body instanceof Blob
      ? this._body._bytes
      : this._body instanceof Uint8Array
        ? this._body
        : new TextEncoder().encode(String(this._body))
    return new ReadableStream({ start(c) { c.enqueue(bytes); c.close() } })
  }
  _consume() {
    if (this._bodyUsed) throw new TypeError('body already used')
    this._bodyUsed = true
  }
  async text() {
    this._consume()
    if (this._body == null) return ''
    if (this._body instanceof Blob) return this._body.text()
    if (this._body instanceof Uint8Array) return new TextDecoder().decode(this._body)
    if (this._body instanceof ReadableStream) {
      const reader = this._body.getReader()
      const chunks = []
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        chunks.push(value)
      }
      const total = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
      let offset = 0
      for (const c of chunks) { total.set(c, offset); offset += c.byteLength }
      return new TextDecoder().decode(total)
    }
    return String(this._body)
  }
  async json() { return JSON.parse(await this.text()) }
  async blob() {
    this._consume()
    if (this._body == null) return new Blob([], { type: '' })
    if (this._body instanceof Blob) return this._body
    if (this._body instanceof Uint8Array) return new Blob([this._body])
    return new Blob([new TextEncoder().encode(String(this._body))])
  }
}
globalThis.Response = Response

function _makeResponse(meta, responseHeaders, bytesPromise, bodyStream, consumeGuard) {
  return {
    get ok()         { return meta.ok },
    get status()     { return meta.status },
    get statusText() { return meta.statusText },
    get headers()    { return responseHeaders },
    get bodyUsed()   { return false },
    async text() {
      consumeGuard()
      const bytes = await bytesPromise
      return new TextDecoder().decode(bytes)
    },
    async json() {
      consumeGuard()
      const bytes = await bytesPromise
      return JSON.parse(new TextDecoder().decode(bytes))
    },
    async blob() {
      consumeGuard()
      const bytes = await bytesPromise
      const contentType = responseHeaders.get('content-type') ?? ''
      return new Blob([bytes], { type: contentType })
    },
    get body() {
      consumeGuard()
      return bodyStream
    },
  }
}

globalThis.utils = {
  fs: {
    cwd:    ()           => $__projectDir,
    resolve:(p)          => $__utils_fs_resolve.apply(undefined, [p], { result: { promise: true, copy: true } }),
    read:   (p, o) => $__utils_fs_read.apply(undefined, [p, o], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    exists: (p)    => $__utils_fs_exists.apply(undefined, [p], { result: { promise: true } }),
    glob:   (p, o) => $__utils_fs_glob.apply(undefined, [p, o], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    write:  (p, c) => $__utils_fs_write.apply(undefined, [p, c], { arguments: { copy: true }, result: { promise: true } }),
    copy:   (src, dest) => $__utils_fs_copy.apply(undefined, [src, dest], { result: { promise: true } }),
    remove: (path, opts) => $__utils_fs_remove.apply(undefined, [path, opts], { arguments: { copy: true }, result: { promise: true } }),
    move:   (src, dest)  => $__utils_fs_move.apply(undefined, [src, dest], { result: { promise: true } }),
    stat:   (path)       => $__utils_fs_stat.apply(undefined, [path], { result: { promise: true, copy: true } }),
    mkdir:  (path)       => $__utils_fs_mkdir.apply(undefined, [path], { result: { promise: true } }),
    readAsBytes: async (path, opts) => {
      const ab = await $__utils_fs_read_bytes.apply(undefined, [path, opts], { arguments: { copy: true }, result: { promise: true, copy: true } })
      return ab ? new Uint8Array(ab) : null
    },
    readStreamAsBytes: (path) => {
      let streamId = null
      return new ReadableStream({
        async start() {
          streamId = await $__utils_fs_readStream.apply(undefined, [path], { result: { promise: true } })
        },
        async pull(controller) {
          const ab = await $__utils_fs_readStream_next.apply(undefined, [streamId], { result: { promise: true, copy: true } })
          if (ab === null) controller.close()
          else controller.enqueue(new Uint8Array(ab))
        }
      })
    },
    readStream: (path) => {
      return globalThis.utils.fs.readStreamAsBytes(path).pipeThrough(new TextDecoderStream())
    },
    writeStreamAsBytes: (path) => {
      let streamId = null
      return new WritableStream({
        async start() {
          streamId = await $__utils_fs_writeStream.apply(undefined, [path], { result: { promise: true } })
        },
        async write(chunk) {
          if (!(chunk instanceof Uint8Array)) throw new TypeError('writeStreamAsBytes requires Uint8Array chunks')
          await $__utils_fs_writeStream_write.apply(undefined, [streamId, chunk.buffer, chunk.byteOffset, chunk.byteLength], { arguments: { copy: true }, result: { promise: true } })
        },
        async close() {
          if (streamId !== null) {
            await $__utils_fs_writeStream_close.apply(undefined, [streamId], { result: { promise: true } })
          }
        },
        async abort() {
          if (streamId !== null) {
            await $__utils_fs_writeStream_close.apply(undefined, [streamId], { result: { promise: true } })
          }
        }
      })
    },
    writeStream: (path) => {
      const wsBytes = globalThis.utils.fs.writeStreamAsBytes(path)
      const writer = wsBytes.getWriter()
      const encoder = new TextEncoder()
      return new WritableStream({
        async write(chunk) {
          await writer.write(encoder.encode(chunk))
        },
        async close() {
          await writer.close()
        },
        async abort(reason) {
          await writer.abort(reason)
        }
      })
    },
    writeAsBytes: (path, content) => {
      if (!(content instanceof Uint8Array)) throw new TypeError('writeAsBytes requires a Uint8Array')
      return $__utils_fs_write_bytes.apply(undefined, [path, content.buffer, content.byteOffset, content.byteLength], { arguments: { copy: true }, result: { promise: true } })
    },
    append: (p, c) => $__utils_fs_append.apply(undefined, [p, c], { arguments: { copy: true }, result: { promise: true } }),
    appendAsBytes: async (p, content) => {
      if (!(content instanceof Uint8Array)) throw new TypeError('appendAsBytes requires a Uint8Array')
      return $__utils_fs_append_bytes.apply(undefined, [p, content.buffer, content.byteOffset, content.byteLength], { arguments: { copy: true }, result: { promise: true } })
    },
    chmod: (p, mode) => $__utils_fs_chmod.apply(undefined, [p, mode], { arguments: { copy: true }, result: { promise: true } }),
    replace: async (p, regex, replacement) => {
      const content = await globalThis.utils.fs.read(p);
      const newContent = content.replace(regex, replacement);
      await globalThis.utils.fs.write(p, newContent);
    },
  },
  shell: {
    exec: async (cmd, o) => {
      let stdinStreamId = null
      let opts = { ...o }
      const hasStdinStream = o && o.stdin && typeof o.stdin.getReader === 'function'
      
      if (hasStdinStream) {
        stdinStreamId = 'shell_stdin_' + Math.random().toString(36).slice(2)
        delete opts.stdin
      } else if (o && o.stdin instanceof Uint8Array) {
        opts.stdin = { type: 'Buffer', data: Array.from(o.stdin) }
      } else if (o && o.stdin && typeof o.stdin === 'object' && o.stdin.buffer) {
        opts.stdin = { type: 'Buffer', data: Array.from(new Uint8Array(o.stdin.buffer)) }
      }
      
      const promise = $__utils_shell_exec.apply(
        undefined, 
        [cmd, opts, stdinStreamId], 
        { arguments: { copy: true }, result: { promise: true, copy: true } }
      )
      
      if (hasStdinStream) {
        const reader = o.stdin.getReader()
        const pump = async () => {
          try {
            while (true) {
              const { value, done } = await reader.read()
              if (done) break
              
              let chunk = value
              if (typeof chunk === 'string') {
                chunk = new TextEncoder().encode(chunk)
              }
              if (!(chunk instanceof Uint8Array)) {
                throw new TypeError('stdin stream must yield string or Uint8Array chunks')
              }
              
              await $__utils_fs_writeStream_write.apply(
                undefined, 
                [stdinStreamId, chunk.buffer], 
                { arguments: { copy: true }, result: { promise: true } }
              )
            }
          } finally {
            await $__utils_fs_writeStream_close.apply(
              undefined, 
              [stdinStreamId], 
              { result: { promise: true } }
            )
          }
        }
        pump()
      }
      
      const res = await promise
      if (res && res.stdout instanceof ArrayBuffer) {
        return { ...res, stdout: new Uint8Array(res.stdout) }
      }
      return res
    },
    execInSession: (cmd, o) => {
      const binaryMode = !!(o && o.binary)
      const id = $__utils_shell_execInSession_open.applySync(undefined, [cmd, o], { arguments: { copy: true } })
      
      const createHybridReadable = (streamType) => {
        let controller
        const listeners = []
        
        const stream = new ReadableStream({
          start(c) {
            controller = c
          }
        })
        
        stream.on = (event, callback) => {
          listeners.push({ event, callback })
        }
        
        const handleData = (ab) => {
          let chunk
          if (binaryMode) {
            chunk = new Uint8Array(ab)
          } else {
            chunk = new TextDecoder().decode(ab)
          }
          
          if (controller) {
            try { controller.enqueue(chunk) } catch (e) {}
          }
          for (const l of listeners) {
            if (l.event === 'data') {
              l.callback(chunk)
            }
          }
        }
        
        const handleEnd = () => {
          if (controller) {
            try { controller.close() } catch (e) {}
          }
          for (const l of listeners) {
            if (l.event === 'end') {
              l.callback()
            }
          }
        }
        
        $__utils_shell_execInSession_on.applySync(undefined, [id, streamType, 'data', handleData], { arguments: { reference: true } })
        $__utils_shell_execInSession_on.applySync(undefined, [id, streamType, 'end', handleEnd], { arguments: { reference: true } })
        
        return stream
      }
      
      const stdoutStream = createHybridReadable('stdout')
      const stderrStream = createHybridReadable('stderr')
      
      const stdinStream = new WritableStream({
        async write(chunk) {
          let rawChunk = chunk
          if (rawChunk instanceof Uint8Array) {
            rawChunk = rawChunk.buffer
          }
          await $__utils_shell_execInSession_write.apply(
            undefined,
            [id, rawChunk],
            { arguments: { copy: true }, result: { promise: true } }
          )
        },
        async close() {
          await $__utils_shell_execInSession_end.apply(
            undefined,
            [id],
            { result: { promise: true } }
          )
        }
      })
      
      stdinStream.write = (text) => {
        let rawChunk = text
        if (rawChunk instanceof Uint8Array) {
          rawChunk = rawChunk.buffer
        }
        $__utils_shell_execInSession_write.applySync(undefined, [id, rawChunk], { arguments: { copy: true } })
      }
      stdinStream.end = () => {
        $__utils_shell_execInSession_end.applySync(undefined, [id])
      }
      
      const session = {
        stdin: stdinStream,
        stdout: stdoutStream,
        stderr: stderrStream,
        on(event, callback) {
          $__utils_shell_execInSession_on.applySync(undefined, [id, 'session', event, callback], { arguments: { reference: true } })
        },
        kill: (signal) => $__utils_shell_execInSession_kill.applySync(undefined, [id, signal ?? null])
      }
      
      if (o && o.signal) {
        o.signal.addEventListener('abort', () => session.kill('SIGTERM'))
      }
      return session
    }
  },
  section: {
    create: (name, data, o) => $__utils_section_create.applySync(undefined, [name, data, o], { arguments: { copy: true }, result: { copy: true } }),
    emit: (sect) => $__utils_section_emit.applySync(undefined, [sect], { arguments: { copy: true } }),
    match: (sectionName, patterns) => $__utils_section_match.applySync(undefined, [sectionName, patterns], { arguments: { copy: true }, result: { copy: true } }),
    selected: () => $__utils_section_selected.applySync(undefined, [], { result: { copy: true } }),
  },
  rune: {
    use: (key, args) => $__utils_rune
      .apply(undefined, [key, args], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    spawn: (key, args) => $__utils_rune_spawn
      .apply(undefined, [key, args], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    kill: (id, signal) => $__utils_rune_kill
      .apply(undefined, [id, signal ?? null], { result: { promise: true } }),
    exists: (id) => $__utils_rune_exists
      .apply(undefined, [id], { result: { promise: true } }),
  },
  json: {
    read:        (p, o) => $__utils_json_read.apply(undefined, [p, o], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    readPath:    (p, q, d) => $__utils_json_readPath.apply(undefined, [p, q, d], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    readPathAll: (p, q, d) => $__utils_json_readPathAll.apply(undefined, [p, q, d], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    write:       (p, d, o) => $__utils_json_write.apply(undefined, [p, d, o], { arguments: { copy: true }, result: { promise: true } }),
    modify: async (filepath, callback, opts = {}) => {
      const { initial, spaces = 2 } = opts
      const missing = !(await globalThis.utils.fs.exists(filepath))
      if (missing && initial === undefined) {
        await globalThis.utils.json.read(filepath)
      }
      const data = missing ? JSON.parse(JSON.stringify(initial)) : await globalThis.utils.json.read(filepath)
      const result = await callback(data, { exists: !missing })
      await globalThis.utils.json.write(filepath, result !== undefined ? result : data, { spaces })
    },
  },
  yaml: {
    read:   (p, o) => $__utils_yaml_read.apply(undefined, [p, o], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    write:  (p, d, o) => $__utils_yaml_write.apply(undefined, [p, d, o], { arguments: { copy: true }, result: { promise: true } }),
    modify: async (filepath, callback, opts = {}) => {
      const { initial, indent = 2 } = opts
      const missing = !(await globalThis.utils.fs.exists(filepath))
      if (missing && initial === undefined) {
        await globalThis.utils.yaml.read(filepath)
      }
      const data = missing
        ? JSON.parse(JSON.stringify(initial))
        : await globalThis.utils.yaml.read(filepath)
      const result = await callback(data, { exists: !missing })
      await globalThis.utils.yaml.write(filepath, result !== undefined ? result : data, { indent })
    },
  },
  xml: {
    read:   (p, o) => $__utils_xml_read.apply(undefined, [p, o], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    write:  (p, d, o) => $__utils_xml_write.apply(undefined, [p, d, o], { arguments: { copy: true }, result: { promise: true } }),
    modify: async (filepath, callback, opts = {}) => {
      const { initial, indent = 2 } = opts
      const missing = !(await globalThis.utils.fs.exists(filepath))
      if (missing && initial === undefined) {
        await globalThis.utils.xml.read(filepath)
      }
      const data = missing ? JSON.parse(JSON.stringify(initial)) : await globalThis.utils.xml.read(filepath)
      const result = await callback(data, { exists: !missing })
      await globalThis.utils.xml.write(filepath, result !== undefined ? result : data, { indent })
    },
  },
  http: {
    fetch: async (input, init = {}) => {
      let url, method, reqHeaders, reqBody
      if (input instanceof Request) {
        url        = input.url
        method     = init.method ?? input.method
        reqHeaders = new Headers(input.headers)
        reqBody    = input._body
        if (input._body != null) {
          if (input._bodyUsed) throw new TypeError('body already used')
          input._bodyUsed = true
        }
      } else {
        url        = String(input)
        method     = init.method ?? 'GET'
        reqHeaders = new Headers(init.headers)
        reqBody    = init.body ?? null
      }
      if (init.headers) { for (const [k, v] of new Headers(init.headers)) reqHeaders.set(k, v) }
      if (init.body !== undefined) reqBody = init.body

      let serializedBody = reqBody
      let isStream = false
      if (reqBody instanceof FormData) {
        serializedBody = reqBody._toWire()
      } else if (reqBody instanceof URLSearchParams) {
        serializedBody = reqBody.toString()
        if (!reqHeaders.has('content-type')) {
          reqHeaders.set('content-type', 'application/x-www-form-urlencoded')
        }
      } else if (reqBody instanceof Blob) {
        serializedBody = { type: 'Buffer', data: Array.from(reqBody._bytes) }
        if (!reqHeaders.has('content-type') && reqBody.type) {
          reqHeaders.set('content-type', reqBody.type)
        }
      } else if (reqBody instanceof Uint8Array) {
        serializedBody = { type: 'Buffer', data: Array.from(reqBody) }
      } else if (reqBody instanceof ReadableStream) {
        isStream = true
      }

      const opts = { method, headers: Object.fromEntries(reqHeaders.entries()) }

      let _bodyUsed = false
      function consumeGuard() {
        if (_bodyUsed) throw new TypeError('body already used')
        _bodyUsed = true
      }

      if (isStream) {
        const reader = reqBody.getReader()
        const streamResponseHeaders = new Headers()
        let streamStreamController = null
        const streamChunks = []
        let streamResolveMeta, streamRejectMeta
        const streamMetaPromise = new Promise((res, rej) => { streamResolveMeta = res; streamRejectMeta = rej })
        const streamBytesPromise = new Promise((resolve, reject) => {
          let metaReceived = false
          const onChunk = async (chunk, chunkMeta) => {
            if (!metaReceived) {
              metaReceived = true
              for (const [k, v] of chunkMeta.headers) streamResponseHeaders.set(k, v)
              streamResolveMeta(chunkMeta)
              return
            }
            if (chunk != null) {
              const bytes = new Uint8Array(chunk)
              streamChunks.push(bytes)
              if (streamStreamController) streamStreamController.enqueue(bytes)
            }
          }
          const onEnd = async () => {
            if (streamStreamController) streamStreamController.close()
            const total = streamChunks.reduce((n, c) => n + c.byteLength, 0)
            const merged = new Uint8Array(total)
            let offset = 0
            for (const c of streamChunks) { merged.set(c, offset); offset += c.byteLength }
            resolve(merged)
          }
          const onError = async (msg) => {
            if (streamStreamController) streamStreamController.error(new Error(msg))
            streamRejectMeta(new Error(msg))
            reject(new Error(msg))
          }
          $__utils_http_body_reader.apply(
            undefined,
            [url, { ...opts }, async () => {
              const { done, value } = await reader.read()
              if (done) return null
              return value.buffer
            }, onChunk, onEnd, onError],
            { arguments: { reference: true }, result: { promise: true } }
          )
        })
        const streamMeta = await streamMetaPromise
        const streamBodyStream = new ReadableStream({
          start(c) { streamStreamController = c },
        })
        return _makeResponse(streamMeta, streamResponseHeaders, streamBytesPromise, streamBodyStream, consumeGuard)
      }

      const responseHeaders = new Headers()
      let streamController = null
      const chunks = []
      let resolveMeta, rejectMeta
      const metaPromise = new Promise((res, rej) => { resolveMeta = res; rejectMeta = rej })

      const bytesPromise = new Promise((resolve, reject) => {
        let metaReceived = false
        const onChunk = async (chunk, chunkMeta) => {
          if (!metaReceived) {
            metaReceived = true
            for (const [k, v] of chunkMeta.headers) responseHeaders.set(k, v)
            resolveMeta(chunkMeta)
            return
          }
          if (chunk != null) {
            const bytes = new Uint8Array(chunk)
            chunks.push(bytes)
            if (streamController) streamController.enqueue(bytes)
          }
        }
        const onEnd = async () => {
          if (streamController) streamController.close()
          const total = chunks.reduce((n, c) => n + c.byteLength, 0)
          const merged = new Uint8Array(total)
          let offset = 0
          for (const c of chunks) { merged.set(c, offset); offset += c.byteLength }
          resolve(merged)
        }
        const onError = async (msg) => {
          if (streamController) streamController.error(new Error(msg))
          rejectMeta(new Error(msg))
          reject(new Error(msg))
        }
        const signal = init.signal ?? null
        const fetchArgs = [url, { ...opts, body: serializedBody }, onChunk, onEnd, onError]
        if (signal) {
          fetchArgs.push((abortCb) => {
            signal.addEventListener('abort', () => abortCb.applyIgnored(undefined, []))
          })
        }
        $__utils_http_fetch.apply(
          undefined,
          fetchArgs,
          { arguments: { reference: true }, result: { promise: true } }
        )
      })

      const meta = await metaPromise

      const bodyStream = new ReadableStream({
        start(c) { streamController = c },
      })

      return _makeResponse(meta, responseHeaders, bytesPromise, bodyStream, consumeGuard)
    },
    server(port, opts = {}) {
      const id = $__utils_http_server_create.applySync(undefined, [port, opts], { arguments: { copy: true } })
      let resolvedPort = port
      return {
        _httpServerId: id,
        get port() { return resolvedPort },
        on(event, handler) {
          if (event !== 'request') throw new Error(`Unknown http.server event: ${event}`)
          $__utils_http_server_set_handler.applySync(undefined, [id, async (meta) => {
            const reqHeaders = new Headers(meta.headers)
            const bodyStream = meta.body
              ? new ReadableStream({ start(c) { c.enqueue(new Uint8Array(meta.body)); c.close() } })
              : null

            const abortCtrl = new AbortController()
            const closedPromise = $__utils_http_server_request_closed
              .apply(undefined, [id, meta.reqId], { result: { promise: true } })
            closedPromise.then(() => abortCtrl.abort())

            const req = Object.assign(Object.create(null), {
              method: meta.method,
              url: meta.url,
              pathname: meta.pathname,
              searchParams: new URLSearchParams(meta.searchParams),
              headers: reqHeaders,
              body: bodyStream,
              bodyUsed: false,
              signal: abortCtrl.signal,
              closed() { return closedPromise },
              on(event, fn) {
                if (event !== 'close') throw new Error(`Unknown IncomingRequest event: ${event}`)
                closedPromise.then(fn)
              },
              async text() {
                if (!meta.body) return ''
                return new TextDecoder().decode(new Uint8Array(meta.body))
              },
              async json() { return JSON.parse(await this.text()) },
              async blob() {
                if (!meta.body) return new Blob([], { type: '' })
                return new Blob([new Uint8Array(meta.body)], { type: meta.headers['content-type'] ?? '' })
              },
            })

            const response = await handler(req)
            const resHeaders = {}
            if (response.headers) response.headers.forEach((v, k) => { resHeaders[k] = v })
            let bodyData = null
            if (response._body != null) {
              if (response._body instanceof ReadableStream) {
                const reader = response._body.getReader()
                const chunks = []
                while (true) {
                  const { value, done } = await reader.read()
                  if (done) break
                  chunks.push(value)
                }
                const total = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
                let offset = 0
                for (const c of chunks) { total.set(c, offset); offset += c.byteLength }
                bodyData = total.buffer.slice(total.byteOffset, total.byteOffset + total.byteLength)
              } else if (response._body instanceof Uint8Array) {
                bodyData = response._body.buffer.slice(response._body.byteOffset, response._body.byteOffset + response._body.byteLength)
              } else if (response._body instanceof Blob) {
                const ab = await response._body.arrayBuffer()
                bodyData = ab
              } else {
                bodyData = new TextEncoder().encode(String(response._body)).buffer
              }
            }
            return {
              status: response.status,
              statusText: response.statusText,
              headers: resHeaders,
              body: bodyData,
            }
          }], { arguments: { reference: true } })
        },
        async open() {
          resolvedPort = await $__utils_http_server_open.apply(undefined, [id], { result: { promise: true, copy: true } })
        },
        async close() {
          await $__utils_http_server_close.apply(undefined, [id], { result: { promise: true } })
        },
        async closed() {
          await $__utils_http_server_closed.apply(undefined, [id], { result: { promise: true } })
        },
      }
    },
  },
  env: {
    read: (key, fallback) => $__utils_env_read
      .apply(undefined, [key, fallback], { arguments: { copy: true }, result: { promise: true, copy: true } })
      .then(r => r !== null ? r : fallback),
    has: (key) => $__utils_env_has
      .apply(undefined, [key], { result: { promise: true } }),
  },
  vars: {
    read: (key, fallback = undefined) => Object.hasOwn(__vars, key) ? __vars[key] : fallback,
    has: (key) => Object.hasOwn(__vars, key),
  },
  archive: {
    zip:     (s, d) => $__utils_archive_zip.apply(undefined,     [s, d], { result: { promise: true } }),
    unzip:   (s, d) => $__utils_archive_unzip.apply(undefined,   [s, d], { result: { promise: true } }),
    tar:   (s, d, o) => $__utils_archive_tar.apply(undefined,   [s, d, o], { arguments: { copy: true }, result: { promise: true } }),
    untar: (s, d, o) => $__utils_archive_untar.apply(undefined, [s, d, o], { arguments: { copy: true }, result: { promise: true } }),
    zipStream: (source) => {
      let streamId = null
      return new ReadableStream({
        async start() {
          streamId = await $__utils_archive_zipStream.apply(undefined, [source], { result: { promise: true } })
        },
        async pull(controller) {
          const ab = await $__utils_fs_readStream_next.apply(undefined, [streamId], { result: { promise: true, copy: true } })
          if (ab === null) controller.close()
          else controller.enqueue(new Uint8Array(ab))
        }
      })
    },
    tarStream: (source, opts) => {
      let streamId = null
      return new ReadableStream({
        async start() {
          streamId = await $__utils_archive_tarStream.apply(undefined, [source, opts], { arguments: { copy: true }, result: { promise: true } })
        },
        async pull(controller) {
          const ab = await $__utils_fs_readStream_next.apply(undefined, [streamId], { result: { promise: true, copy: true } })
          if (ab === null) controller.close()
          else controller.enqueue(new Uint8Array(ab))
        }
      })
    },
    unzipStream: (dest) => {
      let streamId = null
      return new WritableStream({
        async start() {
          streamId = await $__utils_archive_unzipStream.apply(undefined, [dest], { result: { promise: true } })
        },
        async write(chunk) {
          if (!(chunk instanceof Uint8Array)) throw new TypeError('unzipStream requires Uint8Array chunks')
          await $__utils_fs_writeStream_write.apply(undefined, [streamId, chunk.buffer, chunk.byteOffset, chunk.byteLength], { arguments: { copy: true }, result: { promise: true } })
        },
        async close() {
          if (streamId !== null) {
            await $__utils_fs_writeStream_close.apply(undefined, [streamId], { result: { promise: true } })
          }
        },
        async abort() {
          if (streamId !== null) {
            await $__utils_fs_writeStream_close.apply(undefined, [streamId], { result: { promise: true } })
          }
        }
      })
    },
    untarStream: (dest, opts) => {
      let streamId = null
      return new WritableStream({
        async start() {
          streamId = await $__utils_archive_untarStream.apply(undefined, [dest, opts], { arguments: { copy: true }, result: { promise: true } })
        },
        async write(chunk) {
          if (!(chunk instanceof Uint8Array)) throw new TypeError('untarStream requires Uint8Array chunks')
          await $__utils_fs_writeStream_write.apply(undefined, [streamId, chunk.buffer, chunk.byteOffset, chunk.byteLength], { arguments: { copy: true }, result: { promise: true } })
        },
        async close() {
          if (streamId !== null) {
            await $__utils_fs_writeStream_close.apply(undefined, [streamId], { result: { promise: true } })
          }
        },
        async abort() {
          if (streamId !== null) {
            await $__utils_fs_writeStream_close.apply(undefined, [streamId], { result: { promise: true } })
          }
        }
      })
    },
  },
  cache: {
    open: async (location, name) => {
      const id = await $__utils_cache_open.apply(undefined, [location, name ?? null], { result: { promise: true } })
      return {
        set:    (k, v, ttl) => $__utils_cache_set.apply(undefined, [id, k, v, ttl ?? null], { arguments: { copy: true }, result: { promise: true } }),
        get:    (k)          => $__utils_cache_get.apply(undefined, [id, k], { result: { promise: true, copy: true } }),
        has:    (k)          => $__utils_cache_has.apply(undefined, [id, k], { result: { promise: true } }),
        delete: (k)          => $__utils_cache_delete.apply(undefined, [id, k], { result: { promise: true } }),
        clear:  ()           => $__utils_cache_clear.apply(undefined, [id], { result: { promise: true } }),
      }
    },
  },
  sqlite: {
    open: async (location, name) => {
      const id = await $__utils_sqlite_open.apply(undefined, [location, name ?? null], { result: { promise: true } })
      const db = {
        query: (sql, params = []) =>
          $__utils_sqlite_query.apply(undefined, [id, sql, params], { arguments: { copy: true }, result: { promise: true, copy: true } }),
        get: (sql, params = []) =>
          $__utils_sqlite_get.apply(undefined, [id, sql, params], { arguments: { copy: true }, result: { promise: true, copy: true } }),
        exec: (sql, params = []) =>
          $__utils_sqlite_exec.apply(undefined, [id, sql, params], { arguments: { copy: true }, result: { promise: true, copy: true } }),
        run: (sql) =>
          $__utils_sqlite_run.apply(undefined, [id, sql], { arguments: { copy: true }, result: { promise: true } }),
        transaction: async (fn) => {
          await db.exec('BEGIN')
          try { await fn(); await db.exec('COMMIT') }
          catch (e) { await db.exec('ROLLBACK'); throw e }
        },
        close: () =>
          $__utils_sqlite_close.apply(undefined, [id], { result: { promise: true } }),
      }
      return db
    },
  },
  db: {
    connect: async (connectionString) => {
      const id = await $__utils_db_connect.apply(undefined, [connectionString], { arguments: { copy: true }, result: { promise: true, copy: true } })
      const client = {
        query: (sql, params = []) =>
          $__utils_db_query.apply(undefined, [id, sql, params], { arguments: { copy: true }, result: { promise: true, copy: true } }),
        get: (sql, params = []) =>
          $__utils_db_get.apply(undefined, [id, sql, params], { arguments: { copy: true }, result: { promise: true, copy: true } }),
        exec: (sql, params = []) =>
          $__utils_db_exec.apply(undefined, [id, sql, params], { arguments: { copy: true }, result: { promise: true, copy: true } }),
        transaction: async (callback) => {
          if (typeof callback !== 'function') {
            throw new TypeError('transaction callback must be a function')
          }
          await client.exec('BEGIN')
          try {
            const result = await callback(client)
            await client.exec('COMMIT')
            return result
          } catch (err) {
            await client.exec('ROLLBACK')
            throw err
          }
        },
        close: () =>
          $__utils_db_close.apply(undefined, [id], { arguments: { copy: true }, result: { promise: true, copy: true } }),
      }
      return client
    },
  },
  crypto: {
    hash: (algorithm, data) => {
      return $__utils_crypto_hash.apply(undefined, [algorithm, data], { arguments: { copy: true }, result: { promise: true, copy: true } })
    },
    hashAsHex: (algorithm, data) => {
      return $__utils_crypto_hash_hex.apply(undefined, [algorithm, data], { arguments: { copy: true }, result: { promise: true, copy: true } })
    },
    hashAsBase64: (algorithm, data) => {
      return $__utils_crypto_hash_base64.apply(undefined, [algorithm, data], { arguments: { copy: true }, result: { promise: true, copy: true } })
    },
    uuid:         ()     => $__utils_crypto_uuid.applySync(undefined,   []),
    randomHex:    (size) => $__utils_crypto_random_hex.applySync(undefined,    [size]),
    randomBase64: (size) => $__utils_crypto_random_base64.applySync(undefined, [size]),
    randomBytes:  (size) => {
      return $__utils_crypto_random_bytes.applySync(undefined, [size], { result: { copy: true } })
    },

    hmac: (algorithm, key, data) => {
      return $__utils_crypto_hmac.apply(undefined, [algorithm, key, data], { arguments: { copy: true }, result: { promise: true, copy: true } })
    },
    hmacAsHex: (algorithm, key, data) => {
      return $__utils_crypto_hmac_hex.apply(undefined, [algorithm, key, data], { arguments: { copy: true }, result: { promise: true, copy: true } })
    },
    hmacAsBase64: (algorithm, key, data) => {
      return $__utils_crypto_hmac_base64.apply(undefined, [algorithm, key, data], { arguments: { copy: true }, result: { promise: true, copy: true } })
    },

    encrypt: (algorithm, key, iv, data) => {
      return $__utils_crypto_encrypt.apply(undefined, [algorithm, key, iv, data], { arguments: { copy: true }, result: { promise: true, copy: true } })
    },

    decrypt: (algorithm, key, iv, ciphertext) => {
      return $__utils_crypto_decrypt.apply(undefined, [algorithm, key, iv, ciphertext], { arguments: { copy: true }, result: { promise: true, copy: true } })
    },
    hashStream: (algorithm) => {
      let id = null
      return new TransformStream({
        async start() {
          id = await $__utils_crypto_hash_init.apply(undefined, [algorithm], { result: { promise: true } })
        },
        async transform(chunk, controller) {
          if (!(chunk instanceof Uint8Array)) throw new TypeError('hashStream requires Uint8Array chunks')
          const buf = chunk.slice().buffer
          await $__utils_crypto_hash_update.apply(undefined, [id, buf], { arguments: { copy: true }, result: { promise: true } })
        },
        async flush(controller) {
          const ab = await $__utils_crypto_hash_digest.apply(undefined, [id], { result: { promise: true, copy: true } })
          if (ab) controller.enqueue(new Uint8Array(ab))
        }
      })
    },
    encryptStream: (algorithm, key, iv) => {
      let id = null
      if (!(key instanceof Uint8Array) || !(iv instanceof Uint8Array)) {
        throw new TypeError('encryptStream requires Uint8Array for key and iv')
      }
      return new TransformStream({
        async start() {
          id = await $__utils_crypto_cipher_init.apply(undefined, [algorithm, key.buffer, iv.buffer, true], { arguments: { copy: true }, result: { promise: true } })
        },
        async transform(chunk, controller) {
          if (!(chunk instanceof Uint8Array)) throw new TypeError('encryptStream requires Uint8Array chunks')
          const buf = chunk.slice().buffer
          const ab = await $__utils_crypto_cipher_update.apply(undefined, [id, buf], { arguments: { copy: true }, result: { promise: true, copy: true } })
          if (ab) controller.enqueue(new Uint8Array(ab))
        },
        async flush(controller) {
          const ab = await $__utils_crypto_cipher_final.apply(undefined, [id], { result: { promise: true, copy: true } })
          if (ab) controller.enqueue(new Uint8Array(ab))
        }
      })
    },
    decryptStream: (algorithm, key, iv) => {
      let id = null
      if (!(key instanceof Uint8Array) || !(iv instanceof Uint8Array)) {
        throw new TypeError('decryptStream requires Uint8Array for key and iv')
      }
      return new TransformStream({
        async start() {
          id = await $__utils_crypto_cipher_init.apply(undefined, [algorithm, key.buffer, iv.buffer, false], { arguments: { copy: true }, result: { promise: true } })
        },
        async transform(chunk, controller) {
          if (!(chunk instanceof Uint8Array)) throw new TypeError('decryptStream requires Uint8Array chunks')
          const buf = chunk.slice().buffer
          const ab = await $__utils_crypto_cipher_update.apply(undefined, [id, buf], { arguments: { copy: true }, result: { promise: true, copy: true } })
          if (ab) controller.enqueue(new Uint8Array(ab))
        },
        async flush(controller) {
          const ab = await $__utils_crypto_cipher_final.apply(undefined, [id], { result: { promise: true, copy: true } })
          if (ab) controller.enqueue(new Uint8Array(ab))
        }
      })
    },

  },
  codec: {
    toHex: (data) => {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
      let hex = ''
      for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0')
      }
      return hex
    },
    fromHex: (hex) => {
      const len = hex.length / 2
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
      }
      return bytes
    },
    toBase64: (data) => {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      let result = ''
      const len = bytes.length
      for (let i = 0; i < len; i += 3) {
        const b1 = bytes[i]
        const b2 = i + 1 < len ? bytes[i + 1] : NaN
        const b3 = i + 2 < len ? bytes[i + 2] : NaN
        const enc1 = b1 >> 2
        const enc2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4)
        const enc3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6)
        const enc4 = isNaN(b3) ? 64 : b3 & 63
        result += chars[enc1] + chars[enc2] + (enc3 === 64 ? '=' : chars[enc3]) + (enc4 === 64 ? '=' : chars[enc4])
      }
      return result
    },
    fromBase64: (base64) => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      const lookup = new Uint8Array(256)
      for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i
      const clean = base64.replace(/=/g, '')
      const len = clean.length
      const bytes = new Uint8Array(Math.floor(len * 0.75))
      let p = 0
      for (let i = 0; i < len; i += 4) {
        const w1 = lookup[clean.charCodeAt(i)]
        const w2 = i + 1 < len ? lookup[clean.charCodeAt(i + 1)] : 0
        const w3 = i + 2 < len ? lookup[clean.charCodeAt(i + 2)] : 0
        const w4 = i + 3 < len ? lookup[clean.charCodeAt(i + 3)] : 0
        bytes[p++] = (w1 << 2) | (w2 >> 4)
        if (p < bytes.length) bytes[p++] = ((w2 & 15) << 4) | (w3 >> 2)
        if (p < bytes.length) bytes[p++] = ((w3 & 3) << 6) | w4
      }
      return bytes
    },
    fromUtf8: (utf8) => new TextEncoder().encode(utf8),
    toUtf8: (data) => new TextDecoder().decode(data),
    hexEncoderStream: () => {
      return new TransformStream({
        transform(chunk, controller) {
          if (!(chunk instanceof Uint8Array)) throw new TypeError('hexEncoderStream requires Uint8Array chunks')
          let hex = ''
          for (let i = 0; i < chunk.length; i++) {
            hex += chunk[i].toString(16).padStart(2, '0')
          }
          controller.enqueue(hex)
        }
      })
    },
    hexDecoderStream: () => {
      let buffered = ''
      return new TransformStream({
        transform(chunk, controller) {
          const total = buffered + chunk
          const len = Math.floor(total.length / 2) * 2
          const hex = total.slice(0, len)
          buffered = total.slice(len)
          
          if (hex.length > 0) {
            const bytes = new Uint8Array(hex.length / 2)
            for (let i = 0; i < bytes.length; i++) {
              bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
            }
            controller.enqueue(bytes)
          }
        },
        flush(controller) {
          if (buffered.length > 0) {
            throw new Error(`hexDecoderStream: trailing single hex character '${buffered}'`)
          }
        }
      })
    },
    base64EncoderStream: () => {
      let bufferedBytes = new Uint8Array(0)
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      const encode = (bytes) => {
        let result = ''
        const len = bytes.length
        for (let i = 0; i < len; i += 3) {
          const b1 = bytes[i]
          const b2 = i + 1 < len ? bytes[i + 1] : NaN
          const b3 = i + 2 < len ? bytes[i + 2] : NaN
          const enc1 = b1 >> 2
          const enc2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4)
          const enc3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6)
          const enc4 = isNaN(b3) ? 64 : b3 & 63
          result += chars[enc1] + chars[enc2] + (enc3 === 64 ? '=' : chars[enc3]) + (enc4 === 64 ? '=' : chars[enc4])
        }
        return result
      }
      return new TransformStream({
        transform(chunk, controller) {
          if (!(chunk instanceof Uint8Array)) throw new TypeError('base64EncoderStream requires Uint8Array chunks')
          const total = new Uint8Array(bufferedBytes.length + chunk.length)
          total.set(bufferedBytes)
          total.set(chunk, bufferedBytes.length)
          
          const encodeLen = Math.floor(total.length / 3) * 3
          const toEncode = total.subarray(0, encodeLen)
          bufferedBytes = total.subarray(encodeLen)
          
          if (toEncode.length > 0) {
            controller.enqueue(encode(toEncode))
          }
        },
        flush(controller) {
          if (bufferedBytes.length > 0) {
            controller.enqueue(encode(bufferedBytes))
          }
        }
      })
    },
    base64DecoderStream: () => {
      let bufferedChars = ''
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      const lookup = new Uint8Array(256)
      for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i
      const decode = (base64) => {
        const clean = base64.replace(/=/g, '')
        const len = clean.length
        const bytes = new Uint8Array(Math.floor(len * 0.75))
        let p = 0
        for (let i = 0; i < len; i += 4) {
          const w1 = lookup[clean.charCodeAt(i)]
          const w2 = i + 1 < len ? lookup[clean.charCodeAt(i + 1)] : 0
          const w3 = i + 2 < len ? lookup[clean.charCodeAt(i + 2)] : 0
          const w4 = i + 3 < len ? lookup[clean.charCodeAt(i + 3)] : 0
          bytes[p++] = (w1 << 2) | (w2 >> 4)
          if (p < bytes.length) bytes[p++] = ((w2 & 15) << 4) | (w3 >> 2)
          if (p < bytes.length) bytes[p++] = ((w3 & 3) << 6) | w4
        }
        return bytes
      }
      return new TransformStream({
        transform(chunk, controller) {
          const total = bufferedChars + chunk.replace(/\s/g, '')
          const decodeLen = Math.floor(total.length / 4) * 4
          const toDecode = total.slice(0, decodeLen)
          bufferedChars = total.slice(decodeLen)
          
          if (toDecode.length > 0) {
            controller.enqueue(decode(toDecode))
          }
        },
        flush(controller) {
          if (bufferedChars.length > 0) {
            controller.enqueue(decode(bufferedChars.padEnd(4, '=')))
          }
        }
      })
    },
  },
  ws: {
    client(url, opts) {
      const id = $__utils_ws_client.applySync(
        undefined,
        [url, opts],
        { arguments: { copy: true } },
      )
      return {
        on(event, handler) {
          const isolateHandler = event === 'error'
            ? async (errJson) => {
                let d
                try { d = JSON.parse(errJson) }
                catch { d = { message: errJson } }
                const errorObj = new Error(d.message)
                errorObj.name = 'WebSocketError'
                if (d.code) errorObj.code = d.code
                if (d.stack) errorObj.stack = d.stack
                handler(errorObj)
              }
            : event === 'binary'
            ? async (arrayBuffer) => {
                handler(new Uint8Array(arrayBuffer))
              }
            : handler
          $__utils_ws_on.applySync(undefined, [id, event, isolateHandler], {
            arguments: { reference: true },
          })
        },
        open:  ()    => $__utils_ws_open.apply(undefined,  [id],      { result: { promise: true } }),
        sendText: (msg) => $__utils_ws_send_text.apply(undefined,  [id, msg], { result: { promise: true } }),
        sendBinary: (data) => {
          if (data instanceof Uint8Array) {
            return $__utils_ws_send_binary.apply(undefined, [id, data.buffer, data.byteOffset, data.byteLength], {
              arguments: { copy: true },
              result: { promise: true }
            })
          } else if (data instanceof ArrayBuffer) {
            return $__utils_ws_send_binary.apply(undefined, [id, data, 0, data.byteLength], {
              arguments: { copy: true },
              result: { promise: true }
            })
          } else {
            throw new TypeError('sendBinary requires an ArrayBuffer or Uint8Array')
          }
        },
        close: ()    => $__utils_ws_close.apply(undefined, [id],      { result: { promise: true, copy: true } }),
        closed: ()   => $__utils_ws_closed.apply(undefined, [id],     { result: { promise: true, copy: true } }),
      }
    },
    server(portOrServer, opts = {}) {
      const isHttpSession = typeof portOrServer === 'object' && portOrServer !== null && '_httpServerId' in portOrServer
      const portOrId = isHttpSession ? portOrServer._httpServerId : portOrServer
      let resolvedPort = isHttpSession ? portOrServer.port : portOrServer

      const id = $__utils_ws_server_create.applySync(undefined, [portOrId, opts, isHttpSession], { arguments: { copy: true } })

      function makeConnHandle(connId) {
        const connAbort = new AbortController()
        const connHandle = {
          get id() { return connId },
          get signal() { return connAbort.signal },
          on(event, handler) {
            const isolateHandler = event === 'error'
              ? async (errJson) => {
                  let d; try { d = JSON.parse(errJson) } catch { d = { message: errJson } }
                  const e = new Error(d.message); e.name = 'WebSocketError'; if (d.code) e.code = d.code
                  handler(e)
                }
              : event === 'binary'
              ? async (ab) => { handler(new Uint8Array(ab)) }
              : handler
            $__utils_ws_server_conn_on.applySync(undefined, [connId, event, isolateHandler], { arguments: { reference: true } })
          },
          sendText: (msg) => $__utils_ws_server_conn_send_text.apply(undefined, [connId, msg], { result: { promise: true } }),
          sendBinary: (data) => {
            if (data instanceof Uint8Array) {
              return $__utils_ws_server_conn_send_binary.apply(undefined, [connId, data.buffer, data.byteOffset, data.byteLength], { arguments: { copy: true }, result: { promise: true } })
            } else if (data instanceof ArrayBuffer) {
              return $__utils_ws_server_conn_send_binary.apply(undefined, [connId, data, 0, data.byteLength], { arguments: { copy: true }, result: { promise: true } })
            }
            throw new TypeError('sendBinary requires ArrayBuffer or Uint8Array')
          },
          close: (code, reason) => $__utils_ws_server_conn_close.apply(undefined, [connId, code ?? 1000, reason ?? ''], { result: { promise: true, copy: true } }),
          closed: () => $__utils_ws_server_conn_closed.apply(undefined, [connId], { result: { promise: true, copy: true } }),
        }
        connHandle.closed().then(() => connAbort.abort())
        return connHandle
      }

      return {
        _wsServerId: id,
        get port() { return resolvedPort },
        on(event, handler) {
          if (event === 'connection') {
            $__utils_ws_server_set_connection_handler.applySync(undefined, [id, async (connId) => {
              handler(makeConnHandle(connId))
            }], { arguments: { reference: true } })
          } else if (event === 'error') {
            $__utils_ws_server_set_error_handler.applySync(undefined, [id, async (errJson) => {
              let d; try { d = JSON.parse(errJson) } catch { d = { message: errJson } }
              const e = new Error(d.message); e.name = 'WebSocketError'; if (d.code) e.code = d.code
              handler(e)
            }], { arguments: { reference: true } })
          } else {
            throw new Error(`Unknown ws.server event: ${event}`)
          }
        },
        async open() {
          resolvedPort = await $__utils_ws_server_open.apply(undefined, [id], { result: { promise: true, copy: true } })
        },
        async close() {
          await $__utils_ws_server_close.apply(undefined, [id], { result: { promise: true } })
        },
        async closed() {
          await $__utils_ws_server_closed.apply(undefined, [id], { result: { promise: true } })
        },
      }
    },
  },
  time: {
    after: (ms) => $__utils_time_after_ref.apply(undefined, [ms], { result: { promise: true } }),
  },
  md,
  tree,
}

export const { fs, shell, section, rune, json, yaml, xml, http, env, vars, archive, cache, sqlite, db, crypto, codec, ws, time } = globalThis.utils
export { md, tree }

// ─── Global Sandbox Timers ───────────────────────────────────────────────────
const timers = new Map()
let nextTimerId = 1

globalThis.setTimeout = function(callback, delay = 0, ...args) {
  if (typeof callback !== 'function') throw new TypeError('callback must be a function')
  const id = nextTimerId++
  let active = true

  timers.set(id, {
    clear() {
      active = false
      timers.delete(id)
    }
  })

  $__utils_time_after.apply(undefined, [delay], { result: { promise: true } }).then(() => {
    if (active) {
      timers.delete(id)
      callback(...args)
    }
  })

  return id
}

globalThis.clearTimeout = function(id) {
  const timer = timers.get(id)
  if (timer) timer.clear()
}

globalThis.setInterval = function(callback, delay = 0, ...args) {
  if (typeof callback !== 'function') throw new TypeError('callback must be a function')
  const id = nextTimerId++
  let active = true

  const run = () => {
    $__utils_time_after_ref.apply(undefined, [delay], { result: { promise: true } }).then(() => {
      if (active) {
        callback(...args)
        run() // Schedule next execution
      }
    })
  }

  timers.set(id, {
    clear() {
      active = false
      timers.delete(id)
    }
  })

  run()
  return id
}

globalThis.clearInterval = function(id) {
  const timer = timers.get(id)
  if (timer) timer.clear()
}

globalThis.fetch = (input, init) => globalThis.utils.http.fetch(input, init)
