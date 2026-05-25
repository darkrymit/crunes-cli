// Assembled inside the V8 isolate. Imports from pre-compiled isolate modules for
// md and tree; wires host-side Reference callbacks for fs, shell, and section.
// $__utils_* globals are injected by the host before this module is evaluated.

import * as md from 'crunes:md'
import * as tree from 'crunes:tree'

const __vars = JSON.parse($__vars)

globalThis.utils = {
  fs: {
    cwd:    ()           => $__projectDir,
    resolve:(p)          => $__utils_fs_resolve.apply(undefined, [p], { result: { promise: true, copy: true } }),
    read:   (p, o) => $__utils_fs_read.apply(undefined, [p, o], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    exists: (p)    => $__utils_fs_exists.apply(undefined, [p], { result: { promise: true } }),
    glob:   (p, o) => $__utils_fs_glob.apply(undefined, [p, o], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    write:  (p, c) => $__utils_fs_write.apply(undefined, [p, c], { arguments: { copy: true }, result: { promise: true } }),
    copy:   (src, dest) => $__utils_fs_copy.apply(undefined, [src, dest], { result: { promise: true } }),
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
    read:   (p, o) => $__utils_json_read.apply(undefined, [p, o], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    get:    (p, q, d) => $__utils_json_get.apply(undefined, [p, q, d], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    getAll: (p, q, d) => $__utils_json_getAll.apply(undefined, [p, q, d], { arguments: { copy: true }, result: { promise: true, copy: true } }),
    write: (p, d, o) => $__utils_json_write.apply(undefined, [p, d, o], { arguments: { copy: true }, result: { promise: true } }),
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
    fetch: (url, opts) => $__utils_http_fetch
      .apply(undefined, [url, opts], { arguments: { copy: true }, result: { promise: true, copy: true } })
      .then(res => ({
        ok:         res.ok,
        status:     res.status,
        statusText: res.statusText,
        headers:    res.headers,
        text:       () => Promise.resolve(res._text),
        json:       () => Promise.resolve(JSON.parse(res._text)),
      })),
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
    unzip: (s, d) => $__utils_archive_unzip.apply(undefined, [s, d], { result: { promise: true } }),
    zip:   (s, d) => $__utils_archive_zip.apply(undefined,   [s, d], { result: { promise: true } }),
    untar: (s, d) => $__utils_archive_untar.apply(undefined, [s, d], { result: { promise: true } }),
    tar:   (s, d) => $__utils_archive_tar.apply(undefined,   [s, d], { result: { promise: true } }),
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
    hash: {
      hex:    (algorithm, data) => $__crypto_hash_hex.applySync(undefined,    [algorithm, data]),
      base64: (algorithm, data) => $__crypto_hash_base64.applySync(undefined, [algorithm, data]),
    },
    uuid:   ()     => $__crypto_uuid.applySync(undefined,   []),
    hex:    (size) => $__crypto_hex.applySync(undefined,    [size]),
    base64: (size) => $__crypto_base64.applySync(undefined, [size]),
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
    after: (ms) => $__utils_time_after.apply(undefined, [ms], { result: { promise: true } }),
  },
  md,
  tree,
}

export const { fs, shell, section, rune, json, yaml, xml, http, env, vars, archive, cache, sqlite, crypto, ws, time } = globalThis.utils
export { md, tree }
