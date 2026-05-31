// Stub for development/test environments.
// At build time, the esbuild `embed-isolate-sources` plugin in build.mjs
// intercepts this import and injects the real source strings in-memory.
// This file is never used by the built dist/cli.js.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { build } from 'esbuild'

const __dir = dirname(fileURLToPath(import.meta.url))

const result = await build({
  entryPoints: [join(__dir, 'utils-bootstrap.js')],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'esnext',
  external: ['crunes:md', 'crunes:tree'],
})

export const md      = ''
export const tree    = ''
export const utils   = result.outputFiles[0].text
export const console = ''
