// Assembled inside the V8 isolate. Imports from pre-compiled isolate modules for
// md and tree; wires host-side Reference callbacks for fs, shell, and section.
// $__utils_* globals are injected by the host before this module is evaluated.

import * as md from 'crunes:md'
import * as tree from 'crunes:tree'

const __vars = JSON.parse($__vars)

class TextEncoder {
  encode(str) {
    const bytes = []
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i)
      if (code < 0x80) {
        bytes.push(code)
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
      } else if (code < 0xd800 || code >= 0xe000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
      } else {
        i++
        code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff))
        bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
      }
    }
    return new Uint8Array(bytes)
  }
}

class TextDecoder {
  decode(bytes) {
    let str = ''
    let i = 0
    while (i < bytes.length) {
      const b = bytes[i++]
      if (b < 0x80) {
        str += String.fromCharCode(b)
      } else if (b < 0xe0) {
        str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f))
      } else if (b < 0xf0) {
        str += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f))
      } else {
        let code = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f)
        code -= 0x10000
        str += String.fromCharCode(0xd800 | (code >> 10), 0xdc00 | (code & 0x3ff))
      }
    }
    return str
  }
}

globalThis.TextEncoder = TextEncoder
globalThis.TextDecoder = TextDecoder

globalThis.utils = {
  fs: {
    cwd:    ()           => $__projectDir,
    resolve:(p)          => $__utils_fs_resolve.apply(undefined, [p], { result: { promise: true, copy: true } }),
    read:   (p, o) => $__utils_fs_read.apply(undefined, [p, o], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    exists: (p)    => $__utils_fs_exists.apply(undefined, [p], { result: { promise: true } }),
    glob:   (p, o) => $__utils_fs_glob.apply(undefined, [p, o], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    write:  (p, c) => $__utils_fs_write.apply(undefined, [p, c], { arguments: { copy: true }, result: { promise: true } }),
    copy:   (src, dest) => $__utils_fs_copy.apply(undefined, [src, dest], { result: { promise: true } }),
    remove: (path, opts) => $__utils_fs_remove.apply(undefined, [path, opts], { result: { promise: true } }),
    move:   (src, dest)  => $__utils_fs_move.apply(undefined, [src, dest], { result: { promise: true } }),
    stat:   (path)       => $__utils_fs_stat.apply(undefined, [path], { result: { promise: true, copy: true } }),
    mkdir:  (path)       => $__utils_fs_mkdir.apply(undefined, [path], { result: { promise: true } }),
    readAsBytes: async (path, opts) => {
      const ab = await $__utils_fs_read_bytes.apply(undefined, [path, opts], { result: { promise: true, copy: true } })
      return ab ? new Uint8Array(ab) : null
    },
    writeAsBytes: (path, content) => {
      if (!(content instanceof Uint8Array)) throw new TypeError('writeAsBytes requires a Uint8Array')
      return $__utils_fs_write_bytes.apply(undefined, [path, content.buffer], { arguments: { copy: true }, result: { promise: true } })
    },
    replace: async (p, regex, replacement) => {
      const content = await globalThis.utils.fs.read(p);
      const newContent = content.replace(regex, replacement);
      await globalThis.utils.fs.write(p, newContent);
    },
  },
  shell: {
    exec: (cmd, o) => $__utils_shell_exec.apply(undefined, [cmd, o], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    execInSession: (cmd, o) => {
      const id = $__utils_shell_execInSession_open.applySync(undefined, [cmd, o], { arguments: { copy: true } })
      return {
        write: (text) => $__utils_shell_execInSession_write.applySync(undefined, [id, text]),
        expect: (pattern, timeoutMs) => {
          const pat = pattern instanceof RegExp ? { type: 'regex', source: pattern.source, flags: pattern.flags } : pattern
          return $__utils_shell_execInSession_expect.apply(undefined, [id, pat, timeoutMs], { arguments: { copy: true }, result: { promise: true, copy: true } })
        },
        output: () => $__utils_shell_execInSession_output.applySync(undefined, [id]),
        waitForExit: () => $__utils_shell_execInSession_waitForExit.apply(undefined, [id], { result: { promise: true } }),
        kill: () => $__utils_shell_execInSession_kill.applySync(undefined, [id])
      }
    }
  },
  section: {
    create: (name, data, o) => $__utils_section_create.applySync(undefined, [name, data, o], { arguments: { copy: true }, result: { copy: true } }),
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
    fetch: async (url, opts = {}) => {
      let body = opts.body
      if (Array.isArray(body)) {
        body = body.map(entry => {
          if (entry.value instanceof Uint8Array) {
            return { ...entry, value: { type: 'Buffer', data: Array.from(entry.value) } }
          }
          return entry
        })
      }
      const raw = await $__utils_http_fetch.apply(undefined, [url, { ...opts, body }], { arguments: { copy: true }, result: { promise: true, copy: true } })
      return {
        ok:         raw.ok,
        status:     raw.status,
        statusText: raw.statusText,
        headers:    raw.headers,
        text:       () => Promise.resolve(raw._text),
        json:       () => Promise.resolve(JSON.parse(raw._text)),
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
  },
  cache: {
    open: async (location, name) => {
      const id = await $__utils_cache_open.apply(undefined, [location, name ?? null], { result: { promise: true } })
      return {
        set:    (k, v, ttl) => $__utils_cache_set.apply(undefined, [id, k, v, ttl ?? null], { arguments: { copy: true }, result: { promise: true } }),
        get:    (k)          => $__utils_cache_get.apply(undefined, [id, k], { result: { promise: true, copy: true } }),
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
  crypto: {
    hash: (algorithm, data) => {
      const d = data instanceof Uint8Array ? data.buffer : data
      return $__crypto_hash.apply(undefined, [algorithm, d], { arguments: { copy: true }, result: { promise: true, copy: true } })
        .then(arr => new Uint8Array(arr))
    },
    hashAsHex: (algorithm, data) => {
      const d = data instanceof Uint8Array ? data.buffer : data
      return $__crypto_hash_hex.apply(undefined, [algorithm, d], { arguments: { copy: true }, result: { promise: true, copy: true } })
    },
    hashAsBase64: (algorithm, data) => {
      const d = data instanceof Uint8Array ? data.buffer : data
      return $__crypto_hash_base64.apply(undefined, [algorithm, d], { arguments: { copy: true }, result: { promise: true, copy: true } })
    },
    uuid:         ()     => $__crypto_uuid.applySync(undefined,   []),
    randomHex:    (size) => $__crypto_random_hex.applySync(undefined,    [size]),
    randomBase64: (size) => $__crypto_random_base64.applySync(undefined, [size]),

    hmac: (algorithm, key, data) => {
      const k = key instanceof Uint8Array ? key.buffer : key
      const d = data instanceof Uint8Array ? data.buffer : data
      return $__crypto_hmac.apply(undefined, [algorithm, k, d], { arguments: { copy: true }, result: { promise: true, copy: true } })
        .then(arr => new Uint8Array(arr))
    },
    hmacAsHex: (algorithm, key, data) => {
      const k = key instanceof Uint8Array ? key.buffer : key
      const d = data instanceof Uint8Array ? data.buffer : data
      return $__crypto_hmac_hex.apply(undefined, [algorithm, k, d], { arguments: { copy: true }, result: { promise: true, copy: true } })
    },
    hmacAsBase64: (algorithm, key, data) => {
      const k = key instanceof Uint8Array ? key.buffer : key
      const d = data instanceof Uint8Array ? data.buffer : data
      return $__crypto_hmac_base64.apply(undefined, [algorithm, k, d], { arguments: { copy: true }, result: { promise: true, copy: true } })
    },

    encrypt: (algorithm, key, iv, data) => {
      const k = key instanceof Uint8Array ? Array.from(key) : key
      const i = iv instanceof Uint8Array ? Array.from(iv) : iv
      const d = data instanceof Uint8Array ? Array.from(data) : data
      return $__crypto_encrypt.apply(undefined, [algorithm, k, i, d], { arguments: { copy: true }, result: { promise: true, copy: true } })
        .then(ab => new Uint8Array(ab))
    },

    decrypt: (algorithm, key, iv, ciphertext) => {
      const k = key instanceof Uint8Array ? Array.from(key) : key
      const i = iv instanceof Uint8Array ? Array.from(iv) : iv
      const c = ciphertext instanceof Uint8Array ? Array.from(ciphertext) : ciphertext
      return $__crypto_decrypt.apply(undefined, [algorithm, k, i, c], { arguments: { copy: true }, result: { promise: true, copy: true } })
        .then(ab => new Uint8Array(ab))
    },

    // Encoding Conversions
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
    fromUtf8: (utf8) => {
      return new TextEncoder().encode(utf8)
    },
    toUtf8: (data) => {
      return new TextDecoder().decode(data)
    }
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
  },
  time: {
    after: (ms) => $__utils_time_after_ref.apply(undefined, [ms], { result: { promise: true } }),
  },
  md,
  tree,
}

export const { fs, shell, section, rune, json, yaml, xml, http, env, vars, archive, cache, sqlite, crypto, ws, time } = globalThis.utils
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
