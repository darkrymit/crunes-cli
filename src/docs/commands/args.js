export async function handler() {
  process.stdout.write(`# Docs: The args(builder) Export

Runes declare options, positionals, examples, and nested commands using \`export function args(builder)\`. This is executed inside a sandboxed V8 isolate context before running the rune or loading help text.

## 1. Builder Methods Reference

- **\`.option(flags, description, defaultValue?)\`**: Declares a named flag.
  - *Example*: \`b.option('-c, --count <number>', 'Max results', 10)\`
- **\`.positional(spec, description)\`**: Declares a descriptive positional parameter.
  - *Example*: \`b.positional('<name>', 'Item name')\`
- **\`.example(usage, description)\`**: Adds a CLI calling example.
  - *Example*: \`b.example('crunes use my-rune hello', 'Basic call')\`
- **\`.command(name, description, callback?)\`**: Declares a recursively nested command.
  - *Example*:
    \`\`\`javascript
    b.command('remote', 'Manage remotes', remote => {
      remote.command('add', 'Add a remote repository')
    })
    \`\`\`

## 2. Sandbox Extraction & Implicit Build Gotcha
The arguments builder runs inside a strict, secure V8 isolate. Because functions (methods) cannot cross the sandbox-host boundary directly, the host automatically calls \`.build()\` inside the sandbox. 

Developers can return the builder chain directly without appending \`.build()\`:
\`\`\`javascript
export function args(b) {
  return b.positional('<query>', 'Query search') // Implicitly built!
}
\`\`\`
\n`)
}
