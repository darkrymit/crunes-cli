// Assembled inside the V8 isolate. Imports from pre-compiled isolate modules for
// md and tree; wires host-side Reference callbacks for fs, shell, and section.
// $__utils_* globals are injected by the host before this module is evaluated.

import * as md from 'crunes:md'
import * as tree from 'crunes:tree'

const __vars = JSON.parse($__vars)

globalThis.utils = {
  fs: {
    read:   (p, o) => $__utils_fs_read.apply(undefined, [p, o ? JSON.stringify(o) : undefined], { result: { promise: true } }),
    exists: (p)    => $__utils_fs_exists.apply(undefined, [p], { result: { promise: true } }),
    glob:   (p, o) => $__utils_fs_glob.apply(undefined, [p, o ? JSON.stringify(o) : undefined], { result: { promise: true } }).then(JSON.parse),
    write:  (p, c) => $__utils_fs_write.apply(undefined, [p, c], { result: { promise: true } }),
    replace: async (p, regex, replacement) => {
      const content = await globalThis.utils.fs.read(p);
      const newContent = content.replace(regex, replacement);
      await globalThis.utils.fs.write(p, newContent);
    },
  },
  shell: (cmd, o) => $__utils_shell.apply(undefined, [cmd, o ? JSON.stringify(o) : undefined], { result: { promise: true } })
    .then(r => { try { return JSON.parse(r) } catch { return r } }),
  section: {
    create: (name, data, o) => JSON.parse(
      $__utils_section_create.applySync(undefined, [name, JSON.stringify(data), o ? JSON.stringify(o) : undefined])
    ),
    match: (sectionName, patterns) =>
      $__utils_section_match.applySync(undefined, [sectionName, patterns !== undefined ? JSON.stringify(patterns) : undefined]),
    selected: () => {
      const s = $__utils_section_selected.applySync(undefined, [])
      return s ? JSON.parse(s) : null
    },
  },
  rune: (key, args) => $__utils_rune
    .apply(undefined, [key, args ? JSON.stringify(args) : undefined], { result: { promise: true } })
    .then(JSON.parse),
  json: {
    read:   (p, o) => $__utils_json_read.apply(undefined, [p, o ? JSON.stringify(o) : undefined], { result: { promise: true } }).then(JSON.parse),
    get:    (p, q, d) => $__utils_json_get.apply(undefined, [p, q, d !== undefined ? JSON.stringify(d) : undefined], { result: { promise: true } }).then(JSON.parse),
    getAll: (p, q, d) => $__utils_json_getAll.apply(undefined, [p, q, d !== undefined ? JSON.stringify(d) : undefined], { result: { promise: true } }).then(JSON.parse),
    write: (p, d, o) => $__utils_json_write.apply(undefined, [p, JSON.stringify(d), o ? JSON.stringify(o) : undefined], { result: { promise: true } }),
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
    read:   (p, o) => $__utils_yaml_read.apply(undefined, [p, o ? JSON.stringify(o) : undefined], { result: { promise: true } }).then(JSON.parse),
    write:  (p, d, o) => $__utils_yaml_write.apply(undefined, [p, JSON.stringify(d), o ? JSON.stringify(o) : undefined], { result: { promise: true } }),
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
    read:   (p, o) => $__utils_xml_read.apply(undefined, [p, o ? JSON.stringify(o) : undefined], { result: { promise: true } }).then(JSON.parse),
    write:  (p, d, o) => $__utils_xml_write.apply(undefined, [p, JSON.stringify(d), o ? JSON.stringify(o) : undefined], { result: { promise: true } }),
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
  fetch: (url, opts) => $__utils_fetch
    .apply(undefined, [url, opts ? JSON.stringify(opts) : undefined], { result: { promise: true } })
    .then(raw => {
      const res = JSON.parse(raw)
      return {
        ok:         res.ok,
        status:     res.status,
        statusText: res.statusText,
        headers:    res.headers,
        text:       () => Promise.resolve(res._text),
        json:       () => Promise.resolve(JSON.parse(res._text)),
      }
    }),
  env: {
    get: (key, fallback) => $__utils_env_get
      .apply(undefined, [key, fallback !== undefined ? JSON.stringify(fallback) : undefined], { result: { promise: true } })
      .then(r => r !== null ? r : fallback),
    has: (key) => $__utils_env_has
      .apply(undefined, [key], { result: { promise: true } }),
  },
  vars: {
    get: (key, fallback = undefined) => Object.hasOwn(__vars, key) ? __vars[key] : fallback,
    has: (key) => Object.hasOwn(__vars, key),
  },
  archive: {
    unzip: (s, d) => $__utils_archive_unzip.apply(undefined, [s, d], { result: { promise: true } }),
    zip:   (s, d) => $__utils_archive_zip.apply(undefined,   [s, d], { result: { promise: true } }),
    untar: (s, d) => $__utils_archive_untar.apply(undefined, [s, d], { result: { promise: true } }),
    tar:   (s, d) => $__utils_archive_tar.apply(undefined,   [s, d], { result: { promise: true } }),
  },
  md,
  tree,
}
