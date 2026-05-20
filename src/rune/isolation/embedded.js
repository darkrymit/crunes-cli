// Stub for development/test environments.
// At build time, the esbuild `embed-isolate-sources` plugin in build.mjs
// intercepts this import and injects the real source strings in-memory.
// This file is never used by the built dist/cli.js.
export const md = ''
export const tree = ''
export const utils = ''
export const console = ''
