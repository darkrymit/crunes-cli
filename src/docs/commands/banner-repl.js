export async function handler() {
  process.stdout.write(`# Docs: The bannerRepl(args) Export

\`export function bannerRepl(args)\` prints a welcome message before the first prompt. It is called once after \`runRepl()\` resolves, so it can reference module-level state set up during initialization.

## 1. When It Is Called

Lifecycle order at session start:

1. \`argsRepl(builder)\` — schema extracted (once, before startup)
2. \`runRepl(args)\` — session initializer (open connections, set state)
3. \`bannerRepl(args)\` — banner captured and printed to stderr
4. First prompt shown

## 2. Return Value

Return a \`string\` to print it. Return \`undefined\` or \`void\` to show no banner.

In text mode the string is written to **stderr** (so it doesn't pollute stdout section output).
In JSONL mode it is emitted as \`{ type: "banner", message: "..." }\`.

## 3. Example

\`\`\`js
let replDb = null

export async function runRepl(args) {
  replDb = await sqlite.open(args.db, 'books')
  return 'sqlite> '
}

export function bannerRepl(args) {
  // replDb is already open — can reference module-level state
  return \`Connected to \${args.db}/books.db — /help for commands, Ctrl+D to quit\`
}
\`\`\`

## 4. Absence

If \`bannerRepl\` is not exported, no banner is shown and no error is raised.
\n`)
}
