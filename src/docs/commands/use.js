export async function handler() {
  process.stdout.write(`# Docs: The use(args) Export

The entrypoint \`export async function use(args)\` executes the rune's main script lifecycle, receiving a parsed, type-coerced arguments object.

## 1. Parsed Arguments Structure

Inside \`use(args)\`, the \`args\` parameter contains:
- **\`args.command\`** *(string)*: The full, space-separated matched command path (e.g. \`"remote add"\`).
- **\`args.commands\`** *(string[])*: The array of matched command levels (e.g. \`["remote", "add"]\`).
- **\`args._\`** *(string[])*: The raw, unmapped positional arguments array.
- **\`args.$raw\`** *(string[])*: The exact raw string array before parsing.
- **Named Options**: Values parsed from option flags (e.g., \`args.verbose\`).

## 2. Named Positional Mapping Quirks
To make developers' lives significantly simpler, positional parameters defined in \`args(builder)\` are **automatically mapped** to their named keys:
- **Root Level**: If you define \`.positional('<who>', ...)\` and run \`crunes use greeting "Alice"\`, you can access \`args.who\` directly!
- **Nested Command Offset**: If you define \`remote add <name> <url>\`, the parser automatically skips command tokens and maps \`args.name\` and \`args.url\` starting at the correct index!

## 3. Strict 3-Tier Parsing Boundary
1. **Global Flags**: Scoped to the process prefix (e.g. \`crunes --cwd ./project\`).
2. **Command Flags**: Scoped to the command (e.g. \`use --format json\`).
3. **Rune Arguments**: Scoped after the rune key (e.g. \`myrune remote add origin --verbose\`).
Placing global or command flags after the rune key will cause them to be passed as raw rune arguments!
\n`)
}
