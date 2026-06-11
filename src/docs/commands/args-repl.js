export async function handler() {
  process.stdout.write(`# Docs: The argsRepl(builder) Export

Runes declare REPL-specific options using \`export function argsRepl(builder)\`. This schema is parsed **once at session start** and the result is passed as \`args\` to every \`runRepl(args, input)\` call.

## 1. Independence from \`args()\`

\`argsRepl()\` is **completely independent** from \`args()\`. It does NOT fall back to \`args()\` if absent. The two lifecycles have separate schemas:

\`\`\`js
export function args(b) {
  // Schema for: crunes run my-shell "SELECT * FROM t"
  return b
    .option('--db <path>', 'Database path', './state')
    .positional('<query>', 'SQL query to execute')
    .build()
}

export function argsRepl(b) {
  // Schema for: crunes run-repl my-shell --db ./other
  // No <query> positional — input arrives line-by-line via runRepl
  return b
    .option('--db <path>', 'Database path', './state')
    .build()
}
\`\`\`

If \`argsRepl()\` is absent, \`runRepl(args)\` receives \`args = {}\`.

## 2. Builder Methods Reference

Same API as \`args()\` — see \`crunes docs args\` for the full reference:

- **\`.option(flags, description, defaultValue?)\`** — declares a named flag
- **\`.positional(spec, description)\`** — declares a positional argument
- **\`.example(usage, description)\`** — adds a usage example
- **\`.command(name, description, callback?)\`** — declares a nested subcommand
- **\`.build()\`** — finalizes the schema (called implicitly if you return the builder)

## 3. When to Use \`argsRepl()\`

Use it when your REPL session needs startup configuration — a path, a target, a mode — that is provided once when the session starts and then available on every \`runRepl(args)\` call:

\`\`\`js
export function argsRepl(b) {
  return b
    .option('--db <path>', 'SQLite database directory', './state')
    .option('--read-only', 'Open in read-only mode', false)
    .example('crunes run-repl my-shell --db ./prod', 'Open prod database interactively')
    .build()
}

let db = null

export async function runRepl(args) {
  db = await sqlite.open(args.db, 'main')
  // args.readOnly is available for the session
}
\`\`\`

## 4. Sandbox Extraction & Implicit Build

Same behavior as \`args()\` — the builder runs inside a V8 isolate and \`.build()\` is called automatically. Returning the builder chain directly works:

\`\`\`js
export function argsRepl(b) {
  return b.option('--db <path>', 'Database path', './state') // implicitly built
}
\`\`\`
\n`)
}
