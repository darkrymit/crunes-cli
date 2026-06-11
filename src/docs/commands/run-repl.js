export async function handler() {
  process.stdout.write(`# Docs: The REPL Lifecycle Exports

The REPL lifecycle is a family of six named exports. At minimum, export \`runRepl\` or \`inputRepl\` (or both).

## Lifecycle Export Family

| Export | Role | Called | Returns |
|---|---|---|---|
| \`argsRepl(builder)\` | Session option schema | Once, before start | schema |
| \`runRepl(args)\` | Session initializer | Once at session start | \`string | void\` — initial prompt |
| \`bannerRepl(args)\` | Welcome banner | Once after \`runRepl\` | \`string | void\` — banner text |
| \`commandsRepl(builder)\` | Slash command schema | Once, before start | schema |
| \`inputRepl(input)\` | Per-input dispatch | Once per \`InputEvent\` | \`ReplSignal | string | void\` |
| \`completeInputRepl(tokens)\` | Tab completion | On Tab key | \`string[]\` |

## 1. runRepl(args) — Session Initializer

Called once at session start. Open connections, validate config, set up module-level state. Returns the initial prompt string, or void for the default \`"> "\`.

\`\`\`js
export async function runRepl(args) {
  replDb = await sqlite.open(args.db, 'books')
  return 'sqlite> '
}
\`\`\`

## 2. bannerRepl(args) — Welcome Banner

Called once after \`runRepl\` resolves. Printed to stderr before the first prompt. Can use module-level state set up by \`runRepl\`.

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

\`runRepl\` uses a **separate permission namespace** from \`run\`. Declare a \`"runRepl"\` block in \`config.json\`:

\`\`\`json
{
  "runes": {
    "my-shell": {
      "permissions": {
        "run":     { "allow": ["sqlite.read:./state::db"] },
        "runRepl": { "allow": ["sqlite.read:./state::db", "sqlite.write:./state::db"] }
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
\n`)
}
