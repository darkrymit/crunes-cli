export async function handler() {
  process.stdout.write(`# Docs: The completeInputRepl(tokens) Export

\`export async function completeInputRepl(tokens)\` provides tab completion for the REPL session. Called on the Tab key.

## 1. The \`tokens\` Parameter

\`tokens\` is the current input line split on whitespace, where the **last element is the partial word being typed**. This is the same convention as \`resolveCompletions(tokens, program)\` in the crunes CLI completions system.

Examples:

| User has typed | \`tokens\` received |
|---|---|
| \`SEL\` (Tab) | \`['SEL']\` |
| \`SELECT \` (Tab) | \`['SELECT', '']\` |
| \`SELECT * FR\` (Tab) | \`['SELECT', '*', 'FR']\` |

## 2. Return Value

Return \`string[]\` of completion candidates. The host filters by the partial word (prefix match) and passes the result to readline's completer. Return \`[]\` for no completions.

## 3. Example

\`\`\`js
export async function completeInputRepl(tokens) {
  const partial = tokens[tokens.length - 1] ?? ''
  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'UPDATE', 'SET',
    'DELETE', 'CREATE', 'DROP', 'TABLE', 'PRAGMA', 'WITH',
    'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
    'JOIN', 'LEFT', 'INNER', 'ON',
  ]
  return keywords.filter(k => k.startsWith(partial.toUpperCase()))
}
\`\`\`

## 4. Dynamic Completions

You can use module-level session state (set up in \`runRepl()\`) to return context-aware completions — for example, table names from the active database:

\`\`\`js
let tableNames = []

export async function runRepl(args) {
  const db = await sqlite.open(args.db, 'main')
  const rows = await db.query("SELECT name FROM sqlite_master WHERE type='table'")
  tableNames = rows.map(r => r.name)
  return 'db> '
}

export async function completeInputRepl(tokens) {
  const partial = tokens[tokens.length - 1] ?? ''
  return tableNames.filter(t => t.startsWith(partial))
}
\`\`\`

## 5. Absence

If \`completeInputRepl\` is not exported, Tab does nothing — no readline completer is registered.
\n`)
}
