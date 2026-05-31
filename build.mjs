import * as esbuild from 'esbuild'
import { chmodSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

// Plugin: intercepts `import * as EMBEDDED from './embedded.js'` in runner.js
// and returns the bootstrap source strings in memory — no file written to disk.
const embedIsolateSourcesPlugin = {
  name: 'embed-isolate-sources',
  setup(build) {
    build.onResolve({ filter: /\/embedded\.js$/ }, (args) => ({
      path: args.path,
      namespace: 'embed-isolate-sources',
    }))

    build.onLoad({ filter: /.*/, namespace: 'embed-isolate-sources' }, async () => {
      const [mdSrc, treeSrc, consoleSrc] = await Promise.all([
        readFile('./src/rune/api/md.js', 'utf8'),
        readFile('./src/rune/api/tree.js', 'utf8'),
        readFile('./src/rune/isolation/console-bootstrap.js', 'utf8'),
      ])

      const utilsBundle = await esbuild.build({
        entryPoints: ['./src/rune/isolation/utils-bootstrap.js'],
        bundle: true,
        write: false,
        format: 'esm',
        target: 'esnext',
        external: ['crunes:md', 'crunes:tree'],
      })
      const utilsSrc = utilsBundle.outputFiles[0].text

      return {
        contents: [
          `export const md      = ${JSON.stringify(mdSrc)}`,
          `export const tree    = ${JSON.stringify(treeSrc)}`,
          `export const utils   = ${JSON.stringify(utilsSrc)}`,
          `export const console = ${JSON.stringify(consoleSrc)}`,
        ].join('\n'),
        loader: 'js',
      }
    })
  },
}

await esbuild.build({
  entryPoints: ['src/cli/cli.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/cli.js',
  external: ['isolated-vm', '@aws-sdk/client-s3', 'better-sqlite3'],
  inject: ['./require-shim.js'],
  plugins: [embedIsolateSourcesPlugin],
})

// Make executable on Unix/macOS
try { chmodSync('dist/cli.js', 0o755) } catch {}
