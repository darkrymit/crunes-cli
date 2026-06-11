export async function handler() {
  process.stdout.write(`# Docs: The commandsRepl(builder) Export

\`export function commandsRepl(builder)\` declares the slash commands available in a REPL session. Only \`.command()\` at the **root level** is meaningful — \`.option()\` and \`.positional()\` at root are silently ignored. Sub-commands may use the full builder API.

## 1. Declaration

\`\`\`js
export function commandsRepl(b) {
  return b
    .command('tables', 'List all tables in the database')
    .command('schema', 'Show schema for a table', sub =>
      sub.positional('<table>', 'Table name')
    )
    .command('exit', 'Disconnect and quit')
}
\`\`\`

## 2. Dispatch to inputRepl

When the user types \`/tables\` the host intercepts it, parses it against the declared schema, and dispatches to \`inputRepl\` as a \`command\` event:

\`\`\`js
export async function inputRepl(input) {
  if (input.type === 'command') {
    // input.args.$command === 'tables'
    // input.args.$command === 'schema', input.args.table === 'books'
    switch (input.args.$command) {
      case 'tables': { /* list tables */ return undefined }
      case 'schema': { /* show schema for input.args.table */ return undefined }
      case 'exit':   { await replDb.close(); return { type: 'done' } }
    }
  }
}
\`\`\`

## 3. Built-in Host Commands

These are always available regardless of \`commandsRepl\`:

| Command | Action |
|---|---|
| \`/help\`  | Show all available commands (built-in + rune-declared) |
| \`/clear\` | Clear the screen (TTY only) |
| \`/exit\`  | End the session (queues an \`eof\` event into \`inputRepl\`) |

## 4. Unrecognised Slash Input

Input starting with \`/\` that does not match any declared or built-in command is passed through to \`inputRepl\` as a normal \`{ type: 'line', text: '/foo' }\` event — the rune can handle it or ignore it.

## 5. Absence

If \`commandsRepl\` is not exported, no rune-declared slash commands are available. Built-in host commands still work.
\n`)
}
