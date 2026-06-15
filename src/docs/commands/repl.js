export async function handler() {
  process.stdout.write(`# Docs: The REPL Lifecycle Exports

The REPL lifecycle is a family of six named exports. At minimum, export \`repl\` or \`inputRepl\` (or both).

## Lifecycle Export Family

| Export | Role | Called | Returns |
|---|---|---|---|
| \`argsRepl(builder)\` | Session option schema | Once, before start | schema |
| \`repl(args)\` | Session initializer | Once at session start | \`string | void\` — initial prompt |
| \`bannerRepl(args)\` | Welcome banner | Once after \`repl\` | \`string | void\` — banner text |
| \`commandsRepl(builder)\` | Slash command schema | Once, before start | schema |
| \`inputRepl(input)\` | Per-input dispatch | Once per \`InputEvent\` | \`ReplSignal | string | void\` |
| \`completeInputRepl(tokens)\` | Tab completion | On Tab key | \`string[]\` |

## 1. repl(args) — Session Initializer

Called once at session start. Open connections, validate config, set up module-level state. Returns the initial prompt string, or void for the default \`"> "\`.

\`\`\`js
export async function repl(args) {
  replDb = await sqlite.open(args.db, 'books')
  return 'sqlite> '
}
\`\`\`

## 2. bannerRepl(args) — Welcome Banner

Called once after \`repl\` resolves. Printed to stderr before the first prompt. Can use module-level state set up by \`repl\`.

\`\`\`js
export function bannerRepl(args) {
  return \`Connected to \${args.db}/books.db — /help for commands\`
}
\`\`\`

## 3. commandsRepl(builder) — Slash Command Schema

Declares rune slash commands. Only \`.command()\` at root level is used. Matched commands arrive in \`inputRepl\` as \`{ type: 'command', args }\` where \`args.$command\` is the command name.

\`\`\`js
export function commandsRepl(b) {
  return b
    .command('tables', 'List all tables')
    .command('schema', 'Show table schema', sub => sub.positional('<table>', 'Table name'))
}
\`\`\`

## 4. inputRepl(input) — Per-Input Dispatch

Called once per \`InputEvent\`. All session logic lives here.

### InputEvent type

| type | text | When |
|---|---|---|
| \`'line'\` | raw input string | Normal user input |
| \`'interrupt'\` | \`''\` | Ctrl+C on empty prompt |
| \`'eof'\` | \`''\` | Ctrl+D or stdin closed |
| \`'command'\` | — | Matched slash command (use \`input.args.$command\`) |

\`\`\`js
export async function inputRepl(input) {
  if (input.type === 'eof' || input.type === 'interrupt') {
    await replDb.close(); replDb = null
    return { type: 'done', message: 'Disconnected.' }
  }
  if (input.type === 'command') {
    if (input.args.$command === 'tables') { /* ... */ }
    return undefined
  }
  const trimmed = input.text.trim()
  if (!trimmed) return undefined
  const result = await execQuery(replDb, trimmed)
  section.emit(result)
  return 'sqlite> '
}
\`\`\`

### Return values

| Return value | Effect |
|---|---|
| \`undefined\` or \`null\` | Continue — re-prompt |
| \`"string"\` | Continue — update prompt |
| \`{ type: 'prompt', value? }\` | Continue — optionally update prompt |
| \`{ type: 'done', message? }\` | End session |

## 5. completeInputRepl(tokens) — Tab Completion

Called on Tab. Last token is the partial word being typed — same convention as the CLI completions system.

\`\`\`js
export async function completeInputRepl(tokens) {
  const partial = tokens[tokens.length - 1] ?? ''
  return ['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE']
    .filter(k => k.startsWith(partial.toUpperCase()))
}
\`\`\`

## 6. Permissions

\`repl\` uses a **separate permission namespace** from \`run\`. Declare a \`"repl"\` block in \`config.json\`:

\`\`\`json
{
  "runes": {
    "my-shell": {
      "permissions": {
        "run":  { "allow": ["sqlite.read:./state::db"] },
        "repl": { "allow": ["sqlite.read:./state::db", "sqlite.write:./state::db"] }
      }
    }
  }
}
\`\`\`

## 7. Built-in Slash Commands

These are always available regardless of \`commandsRepl\`:

| Command | Action |
|---|---|
| \`/help\` | Show available commands |
| \`/clear\` | Clear the screen (TTY only) |
| \`/exit\` | End the session |

## 8. Input History

Arrow keys (↑/↓) navigate input history within the session. No persistence across sessions.

## 9. Multiline Input (Ctrl+Enter)

In TTY mode, press **Ctrl+Enter** to add a soft newline without dispatching the input. The prompt indents to match the current prompt width. Press **Enter** to flush the entire buffer as a single \`line\` event — \`input.text\` contains the full multi-line string.

\`\`\`
sqlite> SELECT *
        FROM books
        WHERE genre = 'Sci-Fi';
\`\`\`

No new exports required. \`inputRepl()\` always receives the complete accumulated text.

## 10. disposeRepl() — Guaranteed Teardown

Export an optional \`disposeRepl()\` function to run cleanup logic when the session ends, regardless of how it ends (normal exit, Ctrl+D, process signal). Errors thrown here are swallowed.

\`\`\`js
export async function disposeRepl() {
  if (replDb) { await replDb.close(); replDb = null }
}
\`\`\`

This is called automatically before the isolate tears down. It removes the need to close resources inside \`inputRepl()\`'s \`eof\`/\`interrupt\` branches — though doing so there as well is harmless.

## 11. JSONL Input Mode

When \`--format jsonl\` is active and stdin is not a TTY, each stdin line is parsed as a JSON \`InputEvent\` object and dispatched directly:

\`\`\`jsonl
{"type":"line","text":"SELECT 1"}
{"type":"line","text":"SELECT *\\nFROM books\\nWHERE genre = 'Sci-Fi'"}
{"type":"interrupt"}
{"type":"eof"}
\`\`\`

Multi-line text is encoded as \`\\n\` in the JSON string — no Ctrl+Enter needed. Invalid JSON or unrecognised \`type\` values emit a \`{ type: "error" }\` JSONL output line and are skipped; the session continues.
\n`)
}
