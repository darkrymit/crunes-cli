export async function handler() {
  process.stdout.write(`# Docs: The args(builder) Export

Runes declare options, positionals, examples, and nested commands using \`export function args(builder)\`. This is executed inside a sandboxed V8 isolate context before running the rune or loading help text.

## 1. Builder Methods Reference

- **\`.option(flags, description, defaultValue?)\`**: Declares a named flag.
  - *Example*: \`b.option('-v, --verbose', 'Verbose output', false)\`
- **\`.positional(spec, description)\`**: Declares a descriptive positional parameter.
  - *Example*: \`b.positional('<target>', 'Target path')\`
- **\`.example(usage, description)\`**: Adds a CLI calling example.
  - *Example*: \`b.example('crunes run my-rune hello', 'Basic call')\`
- **\`.command(name, description, callback?)\`**: Declares a recursively nested command.
  - The callback receives the subcommand's own builder instance, allowing nested subcommand chains.

## 2. Declaring Nested Subcommands (Unified Example)

To build a clean command hierarchy with nested arguments/options, define subcommand callbacks recursively:

\`\`\`javascript
export function args(b) {
  return b
    // Root level options
    .option('--verbose', 'Verbose logs', false)
    
    // Command: remote
    .command('remote', 'Manage remote repositories', remote => {
      remote
        // Subcommand: remote add <name> <url> [--fetch]
        .command('add', 'Add a remote repository', add => {
          add
            .positional('<name>', 'Remote name')
            .positional('<url>', 'Remote URL')
            .option('--fetch', 'Fetch immediately', true)
        })
        // Subcommand: remote remove <name>
        .command('remove', 'Remove a remote repository', remove => {
          remove
            .positional('<name>', 'Remote name')
        })
    })
}
\`\`\`

## 3. Sandbox Extraction & Implicit Build Gotcha
The arguments builder runs inside a strict, secure V8 isolate. Because functions (methods) cannot cross the sandbox-host boundary directly, the host automatically calls \`.build()\` inside the sandbox. 

Developers can return the builder chain directly without appending \`.build()\`:
\`\`\`javascript
export function args(b) {
  return b.positional('<query>', 'Query search') // Implicitly built!
}
\`\`\`
\n`)
}
