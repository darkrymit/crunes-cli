export async function handler() {
  process.stdout.write(`# Docs: The run(args) Export

The entrypoint \`export async function run(args)\` executes the rune's main script lifecycle, receiving a parsed, type-coerced arguments object.

## 1. Parsed Arguments Structure

Inside \`run(args)\`, the \`args\` parameter contains:
- **\`args.$command\`** *(string)*: The full, space-separated matched command path (e.g. \`"remote add"\`).
- **\`args.$commands\`** *(string[])*: The array of matched command levels (e.g. \`["remote", "add"]\`).
- **\`args._\`** *(string[])*: Data positionals only — command tokens are stripped, so \`args._[0]\` is always the first user-supplied value after the matched command.
- **\`args.$raw\`** *(string[])*: The exact raw string array before parsing.
- **Named Options**: Values parsed from option flags (e.g., \`args.verbose\`).

## 2. Named Positional Mapping
Positional parameters defined in \`args(builder)\` are **automatically mapped** to their named keys:
- **Root Level**: If you define \`.positional('<who>', ...)\` and run \`crunes run greeting "Alice"\`, you can access \`args.who\` directly!
- **Subcommands**: If you define \`remote add <name> <url>\`, after matching \`remote add\` the parser maps \`args.name\` and \`args.url\` from the remaining data positionals.

## 3. Strict 3-Tier Parsing Boundary
1. **Global Flags**: Scoped to the process prefix (e.g. \`crunes --cwd ./project\`).
2. **Command Flags**: Scoped to the command (e.g. \`run --format json\`).
3. **Rune Arguments**: Scoped after the rune key (e.g. \`myrune remote add origin --verbose\`).
Placing global or command flags after the rune key will cause them to be passed as raw rune arguments!
\n`)
}
