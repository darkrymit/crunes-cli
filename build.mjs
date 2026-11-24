import * as esbuild from 'esbuild'
import { chmodSync, rmSync } from 'node:fs'
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

// Plugin: src/rune/api/*.js lazy-load heavy libraries through a local `require` made with
// createRequire, which esbuild does not follow — the libraries would be missing from the
// published package, where they are devDependencies. Dropping that line leaves a plain
// `require(...)`, which esbuild bundles and still evaluates on first call.
const CREATE_REQUIRE_LINE = /^const require = createRequire\(import\.meta\.url\)\r?$/m

const bundleLazyRequiresPlugin = {
  name: 'bundle-lazy-requires',
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/]rune[\\/]api[\\/][^\\/]+\.js$/ }, async (args) => {
      const source = await readFile(args.path, 'utf8')
      if (!CREATE_REQUIRE_LINE.test(source)) return undefined
      return { contents: source.replace(CREATE_REQUIRE_LINE, ''), loader: 'js' }
    })
  },
}

try { rmSync('dist/chunks', { recursive: true, force: true }) } catch {}

await esbuild.build({
  entryPoints: ['src/cli/cli.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: 'dist',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  external: ['isolated-vm', 'better-sqlite3', '@aws-sdk/client-s3', 'esbuild', 'comment-json'],
  inject: ['./require-shim.js'],
  plugins: [embedIsolateSourcesPlugin, bundleLazyRequiresPlugin],
})

await esbuild.build({
  entryPoints: {
    'test/index': 'src/test/index.js',
    'test/register': 'src/test/register.js',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: 'dist',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  external: ['isolated-vm', 'better-sqlite3', '@aws-sdk/client-s3', 'esbuild', 'comment-json'],
  inject: ['./require-shim.js'],
  plugins: [bundleLazyRequiresPlugin],
})

// Make executable on Unix/macOS
try { chmodSync('dist/cli.js', 0o755) } catch {}
