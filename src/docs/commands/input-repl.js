export async function handler() {
  process.stdout.write(`# Docs: The inputRepl(input) Export

\`export async function inputRepl(input)\` is the per-input dispatch handler. It is called once per \`InputEvent\` for the entire session. All session logic — query execution, command handling, exit — lives here.

## 1. InputEvent Types

| \`type\` | \`text\` | \`args\` | When |
|---|---|---|---|
| \`'line'\` | raw input string (untrimmed) | — | Normal user input |
| \`'interrupt'\` | \`''\` | — | Ctrl+C on an empty prompt |
| \`'eof'\` | \`''\` | — | Ctrl+D or stdin closed |
| \`'command'\` | — | \`ParsedArgs\` | Matched slash command (use \`args.$command\`) |

## 2. Return Values

| Return value | Effect |
|---|---|
| \`undefined\` or \`null\` | Continue — re-prompt with current prompt string |
| \`"string"\` | Continue — update prompt to this string |
| \`{ type: 'prompt', value?: string }\` | Continue — optionally update prompt |
| \`{ type: 'done', message?: string }\` | End session — optional goodbye message |

## 3. Example

\`\`\`js
import { sqlite, section, md } from '@utils'

let replDb = null

export async function runRepl(args) {
  replDb = await sqlite.open(args.db, 'books')
  return 'sqlite> '
}

export async function inputRepl(input) {
  // Clean up and exit on Ctrl+C (empty prompt) or Ctrl+D
  if (input.type === 'eof' || input.type === 'interrupt') {
    await replDb.close()
    replDb = null
    return { type: 'done', message: 'Disconnected.' }
  }

  // Handle slash commands declared in commandsRepl()
  if (input.type === 'command') {
    if (input.args.$command === 'exit') {
      await replDb.close()
      replDb = null
      return { type: 'done' }
    }
    return undefined
  }

  // Normal input line
  const trimmed = input.text.trim()
  if (!trimmed) return undefined  // empty line — re-prompt

  const rows = await replDb.query(trimmed)
  section.emit(section.create('result', {
    type: 'markdown',
    content: md.table(Object.keys(rows[0] ?? {}), rows.map(r => Object.values(r).map(String))),
  }))
  return \`[\${rows.length} rows]> \`
}
\`\`\`

## 4. Output

Use \`section.emit()\` to stream sections to the consumer in real time before the function returns. Also accepts an array: \`section.emit([s1, s2])\`.

Use \`console.log()\` for log lines — written to stderr in text mode, emitted as \`log\` events in JSONL mode.

## 5. Session State

The isolate stays alive across all calls. JS module-level variables are the state store — assign to them in \`runRepl()\` and read them in \`inputRepl()\`.
\n`)
}
