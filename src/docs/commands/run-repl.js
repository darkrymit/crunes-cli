export async function handler() {
  process.stdout.write(`# Docs: The runRepl(args, input) Export

The \`export async function runRepl(args, input)\` export makes a rune interactive. It is called once per input line inside a keep-alive isolate — JS closures are the state store across calls.

## 1. Signature

\`\`\`js
export async function runRepl(args, input) {
  // args   — ParsedArgs from argsRepl() schema, built once at session start
  // input  — raw string the user typed this turn (not trimmed)
}
\`\`\`

## 2. The \`input\` Parameter

The raw string typed by the user this turn. Not trimmed — handle whitespace in your rune if needed. For piped / non-TTY consumers (AI agents, scripts), each line of stdin is delivered as a separate \`input\` call.

## 3. The \`args\` Parameter

Parsed once at session start from the \`argsRepl()\` schema. Same \`ParsedArgs\` shape as \`run(args)\`:
- **\`args.$command\`**, **\`args.$commands\`**, **\`args._\`**, **\`args.$rest\`**, **\`args.$raw\`**
- Named options and positionals declared in \`argsRepl()\`

If \`argsRepl()\` is absent, \`args\` is an empty object \`{}\`.

## 4. Return Values — ReplSignal

Return value controls session flow:

| Return value | Effect |
|---|---|
| \`undefined\` or \`null\` | Continue — re-prompt with current prompt string |
| \`"string"\` | Continue — update prompt to this string |
| \`{ type: 'prompt', value?: string }\` | Continue — optionally update prompt |
| \`{ type: 'done', message?: string }\` | End session — optional goodbye message printed |

## 5. Output

Use \`console.log()\` for log lines (written to stderr in text mode, emitted as \`log\` events in JSONL mode).

Use \`utils.section.emit(section)\` to stream sections to the consumer in real time before the step returns. Also accepts an array: \`utils.section.emit([s1, s2])\`.

\`\`\`js
import { sqlite, section, md } from '@utils'

export async function runRepl(args, input) {
  const trimmed = input.trim()
  if (!trimmed) return undefined

  if (trimmed === 'exit') return { type: 'done', message: 'Bye!' }

  const rows = await db.query(trimmed)
  section.emit(section.create('result', {
    type: 'markdown',
    content: md.table(Object.keys(rows[0] ?? {}), rows.map(r => Object.values(r).map(String))),
  }))
  return \`[\${rows.length} rows]> \`
}
\`\`\`

## 6. Permissions

\`runRepl\` uses a **separate permission namespace** from \`run\`. Declare a \`"runRepl"\` block in \`config.json\` — it does not inherit from \`"run"\`:

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

If the \`"runRepl"\` block is absent, all permission checks inside \`runRepl\` will throw a \`PermissionError\`.

## 7. Strict 3-Tier Parsing Boundary

Global flags and rune args follow the same boundary as \`crunes run\`:
\`\`\`bash
crunes --cwd ./project run-repl --format jsonl my-shell --db ./data
#      ^global         ^command                ^rune args
\`\`\`
\n`)
}
