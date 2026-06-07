export async function handler() {
  process.stdout.write(`# Docs: The run(args) Export

The entrypoint \`export async function run(args)\` executes the rune's main script lifecycle, receiving a parsed, type-coerced arguments object.

## 1. Parsed Arguments Structure

Inside \`run(args)\`, the \`args\` parameter contains:
- **\`args.$command\`** *(string)*: The space-separated matched command path (e.g. \`"remote add"\` or \`""\` for the root).
- **\`args.$commands\`** *(string[])*: The array of matched command levels (e.g. \`["remote", "add"]\` or \`[]\` for the root).
- **\`args._\`** *(string[])*: All data positionals (command tokens are stripped, so \`args._[0]\` is always the first positional argument after the matched command path).
- **\`args.$raw\`** *(string[])*: The exact raw string array before parsing.
- **Named Options/Positionals**: Automatically mapped values from flags and positionals.

## 2. Parameter Mapping (Unified Example)

Consider a rune configured with the following command structure:
\`\`\`
my-rune [--verbose] remote add <name> <url> [--fetch]
\`\`\`

When a user runs the command:
\`\`\`bash
crunes run my-rune remote add origin https://github.com/foo/bar.git --fetch
\`\`\`

The parsed \`args\` object will look like this:
\`\`\`json
{
  "$command": "remote add",
  "$commands": ["remote", "add"],
  "name": "origin",
  "url": "https://github.com/foo/bar.git",
  "fetch": true,
  "verbose": false,
  "_": ["origin", "https://github.com/foo/bar.git"],
  "$raw": ["remote", "add", "origin", "https://github.com/foo/bar.git", "--fetch"]
}
\`\`\`

## 3. Subcommand Routing in run(args)

You can route your code execution based on the matched command path in \`args.$command\`:

\`\`\`javascript
import { section } from '@utils'

export async function run(args) {
  // 1. Root level command logic
  if (args.$command === '') {
    return section.create('root', { type: 'markdown', content: 'Root command' })
  }

  // 2. Subcommand routing
  switch (args.$command) {
    case 'remote add':
      // Access named positionals and options directly
      return section.create('remote', {
        type: 'markdown',
        content: \`Adding remote \${args.name} at \${args.url} (fetch: \${args.fetch})\`
      })

    case 'remote remove':
      return section.create('remote', {
        type: 'markdown',
        content: \`Removing remote \${args.name}\`
      })

    default:
      throw new Error(\`Unknown command: \${args.$command}\`)
  }
}
\`\`\`

## 4. Strict 3-Tier Parsing Boundary
1. **Global Flags**: Scoped to the process prefix (e.g. \`crunes --cwd ./project\`).
2. **Command Flags**: Scoped to the command (e.g. \`run --format json\`).
3. **Rune Arguments**: Scoped after the rune key (e.g. \`myrune remote add origin --verbose\`).
Placing global or command flags after the rune key will cause them to be passed as raw rune arguments!
\n`)
}
