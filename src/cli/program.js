import path from 'node:path'
import { Command, Option } from 'commander'
import { configure as configureOutput } from '../shared/output.js'

export function buildProgram() {
  const program = new Command()

  program
    .name('crunes')
    .description('CLI tool for managing context runes')
    .version('0.8.1', '-v, --version')
    .enablePositionalOptions()
    .option('-y, --yes', 'assume yes to all prompts and skip interactive mode (also auto-detected in non-TTY environments)')
    .option('-p, --plain', 'plain output: no colors, no box-drawing, plain symbols — optimised for AI/pipe use')
    .option('--cwd <path>', 'project root to use instead of the current working directory')
    .option('--ccd <path>', 'config directory — where .crunes/config.json and local rune files live (default: --cwd)')
    .option('--verbose', 'print full error stack traces and other verbose output')

  program.hook('preAction', (_thisCommand, actionCommand) => {
    configureOutput({ plain: !!program.opts().plain, verbose: !!program.opts().verbose })
    if (program.opts().verbose) {
      console.error(`[crunes:debug] Executing command: ${actionCommand.name()}`)
    }
  })

  function projectRoot() {
    const cwd = program.opts().cwd
    return cwd ? path.resolve(process.cwd(), cwd) : process.cwd()
  }

  function configRoot() {
    const ccd = program.opts().ccd
    return ccd ? path.resolve(process.cwd(), ccd) : projectRoot()
  }

  program
    .command('run [args...]')
    .description('Run one or more runes and output the result.')
    .addHelpText('after',
      '\nImportant: Global flags (e.g. --cwd) MUST appear before the "run" command.\n\n' +
      'Syntax:\n' +
      '  [run-flags] <key>[-s s1,s2] [rune-args...]\n' +
      '  -b [run-flags] <key1>[-s s1] [rune-args1] + <key2>[-s s2] [rune-args2]\n\n' +
      'Command flags:\n' +
      '  -b, --batch          enable batching multiple runes with +\n' +
      '  --format text|jsonl  output format (default: text)\n' +
      '  --fail-fast          stop on first error\n\n' +
      'Per-rune bracket flags (inside key[...]):\n' +
      '  -s, --section s1,s2  filter output sections for this rune\n\n' +
      'Key prefixes:\n' +
      '  project:name         resolve from project config only\n' +
      '  plugin:name          resolve directly from an enabled plugin\n' +
      '  name                 auto-resolve: project config first, then plugins\n\n' +
      'For rune argument documentation: crunes docs rune <key>'
    )
    .allowUnknownOption()
    .passThroughOptions()
    .action(async (args, _opts, _command) => {
      const { handler, parseRunArgs } = await import('../rune/commands/run.js')
      const { segments, format, failFast, isBatch } = parseRunArgs(args)
      await handler({ segments, format, failFast, isBatch, projectRoot: projectRoot(), configRoot: configRoot() })
    })

  program
    .command('repl [args...]')
    .description('Run a rune in interactive REPL mode (keeps isolate alive across inputs).')
    .addHelpText('after',
      '\nImportant: Global flags (e.g. --cwd) MUST appear before the "repl" command.\n\n' +
      'Syntax:\n' +
      '  [--format text|jsonl] <key>[-s s1,s2] [rune-args...]\n\n' +
      'Per-rune bracket flags (inside key[...]):\n' +
      '  -s, --section s1,s2  filter output sections for this rune\n\n' +
      'The rune must export repl(args) and/or inputRepl(input).\n' +
      'For rune argument documentation: crunes docs rune <key>'
    )
    .allowUnknownOption()
    .passThroughOptions()
    .action(async (args, _opts, _command) => {
      const { handler, parseReplArgs } = await import('../rune/commands/repl.js')
      const { key, runeArgs, sections, format } = parseReplArgs(args)
      await handler({ key, runeArgs, sections, format, projectRoot: projectRoot(), configRoot: configRoot() })
    })

  const helpGroup = program.command('docs').description('Show documentation for runes and other resources')

  helpGroup
    .command('rune <rune...>')
    .description('Show usage, argument schema, and examples for one or more runes')
    .addOption(new Option('--format <format>', 'output format').choices(['text', 'json']).default('text'))
    .action(async (keys, opts) => {
      const { handler } = await import('../docs/commands/rune.js')
      await handler({ keys, format: opts.format, projectRoot: projectRoot(), configRoot: configRoot() })
    })

  helpGroup
    .command('utils [namespaces...]')
    .description('Show function signatures and parameter docs for utils.* namespaces')
    .addOption(new Option('--format <format>', 'output format').choices(['text', 'json']).default('text'))
    .action(async (namespaces, opts) => {
      const { handler } = await import('../docs/commands/utils.js')
      await handler({ namespaces, format: opts.format })
    })

  helpGroup
    .command('globals')
    .description('Show injected sandbox globals and ES2020 builtins available in rune scripts')
    .addOption(new Option('--format <format>', 'output format').choices(['text', 'json']).default('text'))
    .action(async (opts) => {
      const { handler } = await import('../docs/commands/globals.js')
      await handler({ format: opts.format })
    })

  helpGroup
    .command('intro')
    .description('Generate a comprehensive introduction and context document for Crunes and the active project')
    .option('-g, --global', 'generate a global, pure-ecosystem guide (skip local project context)')
    .option('--out <path>', 'output file path (defaults to stdout)')
    .addOption(new Option('--format <format>', 'output format').choices(['text', 'json']).default('text'))
    .action(async (opts) => {
      const { handler } = await import('../docs/commands/intro.js')
      await handler({
        global: !!opts.global,
        out: opts.out,
        format: opts.format,
        projectRoot: projectRoot(),
        configRoot: configRoot(),
      })
    })

  helpGroup
    .command('args')
    .description('Show detailed documentation, conventions, and examples for the args(builder) export')
    .action(async () => {
      const { handler } = await import('../docs/commands/args.js')
      await handler()
    })

  helpGroup
    .command('run')
    .description('Show detailed documentation, conventions, and examples for the run(args) export')
    .action(async () => {
      const { handler } = await import('../docs/commands/run.js')
      await handler()
    })

  helpGroup
    .command('repl')
    .description('Show detailed documentation, conventions, and examples for the repl(args) export')
    .action(async () => {
      const { handler } = await import('../docs/commands/repl.js')
      await handler()
    })

  helpGroup
    .command('args-repl')
    .description('Show detailed documentation, conventions, and examples for the argsRepl(builder) export')
    .action(async () => {
      const { handler } = await import('../docs/commands/args-repl.js')
      await handler()
    })

  helpGroup
    .command('banner-repl')
    .description('Show detailed documentation and examples for the bannerRepl(args) export')
    .action(async () => {
      const { handler } = await import('../docs/commands/banner-repl.js')
      await handler()
    })

  helpGroup
    .command('commands-repl')
    .description('Show detailed documentation and examples for the commandsRepl(builder) export')
    .action(async () => {
      const { handler } = await import('../docs/commands/commands-repl.js')
      await handler()
    })

  helpGroup
    .command('input-repl')
    .description('Show detailed documentation and examples for the inputRepl(input) export')
    .action(async () => {
      const { handler } = await import('../docs/commands/input-repl.js')
      await handler()
    })

  helpGroup
    .command('complete-input-repl')
    .description('Show detailed documentation and examples for the completeInputRepl(tokens) export')
    .action(async () => {
      const { handler } = await import('../docs/commands/complete-input-repl.js')
      await handler()
    })

  program
    .command('version')
    .description('Print the installed version and check for updates')
    .option('--no-check', 'skip the npm update check')
    .action(async (opts) => {
      const { handler } = await import('./commands/version.js')
      await handler({ check: opts.check, plain: !!program.opts().plain })
    })

  program
    .command('doctor')
    .description('Verify environment and project setup')
    .action(async () => {
      const { handler } = await import('./commands/doctor.js')
      await handler({ projectRoot: projectRoot() })
    })

  program
    .command('bench [args...]')
    .description('Time rune execution and report fast, ok, or slow.')
    .addHelpText('after',
      '\nImportant: Global flags (e.g. --cwd) MUST appear before the "bench" command.\n\n' +
      'Syntax:\n' +
      '  [--runs <n>] [--warmup] <key>[--runs <n>] [--warmup] [-s s1,s2] [rune-args...]\n\n' +
      'Command flags:\n' +
      '  -b, --batch          enable batching multiple runes with +\n' +
      '  --format text|jsonl  output format (default: text)\n' +
      '  --fail-fast          stop on first error\n' +
      '  --runs <n>           default number of runs for all runes (default: 1)\n' +
      '  --warmup             default warmup run for all runes\n\n' +
      'Per-rune bracket flags (inside key[...]):\n' +
      '  --runs <n>           override run count for this rune\n' +
      '  --warmup             override warmup for this rune\n' +
      '  -s, --section s1,s2  filter output sections for this rune'
    )
    .allowUnknownOption()
    .passThroughOptions()
    .action(async (args, _opts, _command) => {
      const { handler, parseBenchArgs } = await import('../rune/commands/benchmark.js')
      const parsed = parseBenchArgs(args)
      if (!parsed.segments[0]?.key) {
        const { output } = await import('../shared/output.js')
        output.error('Missing required argument: <rune>')
        process.exit(1)
      }
      await handler({ ...parsed, plain: !!program.opts().plain, projectRoot: projectRoot(), configRoot: configRoot() })
    })

  program
    .command('list')
    .description('List all registered runes')
    .addOption(new Option('--format <format>', 'output format').choices(['text', 'json']).default('text'))
    .action(async (opts) => {
      const { handler } = await import('../rune/commands/list.js')
      await handler({ format: opts.format, plain: !!program.opts().plain, projectRoot: projectRoot(), configRoot: configRoot() })
    })

  // Job management commands
  const jobs = program.command('job').description('Manage background jobs')

  jobs
    .command('list')
    .description('List background jobs for the current project')
    .action(async () => {
      const { handler } = await import('../job/commands/list.js')
      await handler({ projectDir: projectRoot() })
    })

  jobs
    .command('kill <id>')
    .description('Send SIGTERM to a background job and remove its record')
    .action(async (id) => {
      const { handler } = await import('../job/commands/kill.js')
      await handler({ id, projectDir: projectRoot() })
    })

  // Cache management commands
  const cache = program.command('cache').description('Manage cache buckets')

  cache
    .command('list')
    .description('List cache buckets for the current project')
    .option('-p, --plugin [pluginId]', 'filter to plugin-related buckets; pass a value to match a specific plugin')
    .action(async (opts) => {
      const { handler } = await import('../cache/commands/list.js')
      await handler({ projectDir: projectRoot(), plugin: opts.plugin })
    })

  cache
    .command('clear <id>')
    .description('Remove expired keys from a cache bucket')
    .option('-p, --plugin [pluginId]', 'filter to plugin-related buckets')
    .action(async (id, opts) => {
      const { handler } = await import('../cache/commands/clear.js')
      await handler({ id, projectDir: projectRoot(), plugin: opts.plugin })
    })

  cache
    .command('delete <id>')
    .description('Delete a cache bucket directory and deregister it')
    .option('-p, --plugin [pluginId]', 'filter to plugin-related buckets')
    .action(async (id, opts) => {
      const { handler } = await import('../cache/commands/delete.js')
      await handler({ id, projectDir: projectRoot(), yes: !!program.opts().yes, plugin: opts.plugin })
    })

  cache
    .command('unset <id> <key>')
    .description('Remove a single key from a cache bucket')
    .option('-p, --plugin [pluginId]', 'filter to plugin-related buckets')
    .action(async (id, key, opts) => {
      const { handler } = await import('../cache/commands/unset.js')
      await handler({ id, key, projectDir: projectRoot(), plugin: opts.plugin })
    })

  // Schema cache management commands
  const schema = program.command('schema').description('Manage schema cache')

  schema
    .command('list')
    .description('List cached schemas for the current project')
    .action(async () => {
      const { handler } = await import('../rune/commands/schema/list.js')
      await handler({ projectDir: projectRoot() })
    })

  schema
    .command('delete <rune-key>')
    .description('Delete cached schema files for a rune key')
    .action(async (runeKey) => {
      const { handler } = await import('../rune/commands/schema/delete.js')
      await handler({ runeKey, projectDir: projectRoot() })
    })

  // SQLite management commands
  const sqlite = program.command('sqlite').description('Manage SQLite databases')

  sqlite
    .command('list')
    .description('List all registered SQLite databases')
    .option('-p, --plugin [pluginId]', 'filter to plugin-related databases; pass a value to match a specific plugin')
    .action(async (opts) => {
      const { handler } = await import('../sqlite/commands/list.js')
      await handler({ projectDir: projectRoot(), plugin: opts.plugin })
    })

  sqlite
    .command('delete <id>')
    .description('Delete a SQLite database file and deregister it')
    .option('-p, --plugin [pluginId]', 'filter to plugin-related databases')
    .action(async (id, opts) => {
      const { handler } = await import('../sqlite/commands/delete.js')
      await handler({ id, yes: !!program.opts().yes, projectDir: projectRoot(), plugin: opts.plugin })
    })

  sqlite
    .command('query <id> <sql>')
    .description('Run a SQL query against a registered SQLite database (readonly)')
    .option('-p, --plugin [pluginId]', 'filter to plugin-related databases')
    .action(async (id, sql, opts) => {
      const { handler } = await import('../sqlite/commands/query.js')
      await handler({ id, sql, projectDir: projectRoot(), plugin: opts.plugin })
    })

  program
    .command('init')
    .description('Create .crunes/config.json in the current project')
    .action(async () => {
      const { handler } = await import('../core/commands/init.js')
      await handler({ yes: !!program.opts().yes, projectRoot: projectRoot() })
    })

  program
    .command('create [new-rune]')
    .description('Scaffold a new rune and register it in config')
    .addOption(new Option('--format <format>', 'rune output format').choices(['tree', 'markdown']))
    .option('--path <path>', 'file path for the rune (default: .crunes/runes/<key>.js)')
    .option('--name <name>', 'human-readable label shown in crunes list')
    .option('--description <description>', 'short description of what context this rune provides')
    .action(async (key, opts) => {
      const { handler } = await import('../rune/commands/create.js')
      await handler({ key, format: opts.format, path: opts.path, name: opts.name, description: opts.description, yes: !!program.opts().yes, projectRoot: projectRoot(), configRoot: configRoot() })
    })

  // Plugin management commands
  const plugin = program.command('plugin').description('Manage rune plugins')

  plugin
    .command('install <source>')
    .description('Install a plugin from a configured marketplace in the format <marketplace>@<plugin>')
    .action(async (source) => {
      const { handler } = await import('../plugin/commands/install.js')
      await handler({ source, projectRoot: projectRoot(), configRoot: configRoot(), yes: !!program.opts().yes })
    })

  plugin
    .command('uninstall <plugin>')
    .description('Uninstall an installed plugin')
    .action(async (name) => {
      const { handler } = await import('../plugin/commands/uninstall.js')
      await handler({ name, yes: !!program.opts().yes, projectRoot: projectRoot(), configRoot: configRoot() })
    })

  plugin
    .command('list')
    .description('List installed plugins')
    .addOption(new Option('--format <format>', 'output format').choices(['text', 'json']).default('text'))
    .action(async (opts) => {
      const { handler } = await import('../plugin/commands/list.js')
      await handler({ format: opts.format })
    })

  plugin
    .command('update [plugin]')
    .description('Update one or all installed plugins')
    .action(async (name) => {
      const { handler } = await import('../plugin/commands/update.js')
      await handler({ name, projectRoot: projectRoot(), configRoot: configRoot() })
    })

  plugin
    .command('enable <plugin>')
    .description('Add a plugin to this project\'s enabled list')
    .action(async (name) => {
      const { handler } = await import('../plugin/commands/enable.js')
      await handler({ name, projectRoot: projectRoot(), configRoot: configRoot() })
    })

  plugin
    .command('disable <plugin>')
    .description('Remove a plugin from this project\'s enabled list')
    .action(async (name) => {
      const { handler } = await import('../plugin/commands/disable.js')
      await handler({ name, projectRoot: projectRoot(), configRoot: configRoot() })
    })

  plugin
    .command('create [new-plugin]')
    .description('Scaffold a new plugin directory with all required files')
    .option('--description <text>', 'short description for plugin.json and marketplace.json')
    .option('--author <name>', 'author name (default: git config user.name)')
    .option('--license <spdx>', 'SPDX license identifier (default: MIT)')
    .option('--out <path>', 'output directory (default: ./<name>)')
    .action(async (name, opts) => {
      const { handler } = await import('../plugin/commands/create.js')
      await handler({ name, description: opts.description, author: opts.author, license: opts.license, out: opts.out, yes: !!program.opts().yes, projectRoot: projectRoot() })
    })

  // Template commands
  const template = program.command('template').description('Manage rune templates')

  template
    .command('list [template-source]')
    .description('List available templates. [template-source] can be "project" (project config only) or a plugin name; omit to list all.')
    .addOption(new Option('--format <format>', 'output format').choices(['text', 'json']).default('text'))
    .action(async (source, opts) => {
      const { handler } = await import('../template/commands/list.js')
      await handler({ source, format: opts.format, plain: !!program.opts().plain, projectRoot: projectRoot(), configRoot: configRoot() })
    })

  template
    .command('apply <template>')
    .description('Copy a template into the project as a new rune and register it in config.')
    .addHelpText('after',
      '\nKey prefixes:\n' +
      '  project:name  — use a template defined in this project\'s config\n' +
      '  plugin:name   — use a template from a specific installed plugin\n' +
      '  name          — auto-resolve: project config first, then installed plugins'
    )
    .option('--as <new-rune>', 'register the rune under a different key (default: template name)')
    .option('--path <path>', 'file path for the rune (default: .crunes/runes/<key>.js)')
    .option('--name <name>', 'human-readable label shown in crunes list')
    .option('--description <description>', 'short description of what context this rune provides')
    .action(async (ref, opts) => {
      const { handler } = await import('../template/commands/apply.js')
      await handler({ ref, key: opts.as, path: opts.path, name: opts.name, description: opts.description, yes: !!program.opts().yes, projectRoot: projectRoot(), configRoot: configRoot() })
    })

  template
    .command('create [new-template]')
    .description('Scaffold a new template file and register it in config')
    .option('--path <path>', 'file path for the template (default: .crunes/templates/<name>.js)')
    .option('--name <name>', 'display label shown in crunes template list (separate from the template key)')
    .option('--description <description>', 'short description of what kind of rune this template produces')
    .action(async (name, opts) => {
      const { handler } = await import('../template/commands/create.js')
      await handler({ name, path: opts.path, templateName: opts.name, description: opts.description, yes: !!program.opts().yes, projectRoot: projectRoot(), configRoot: configRoot() })
    })

  // Marketplace commands
  const marketplace = program.command('marketplace').description('Manage plugin marketplace sources')

  marketplace
    .command('add <url>')
    .description('Add a marketplace source URL')
    .action(async (url) => {
      const { handler } = await import('../marketplace/commands/add.js')
      await handler({ url })
    })

  marketplace
    .command('remove <url>')
    .description('Remove a marketplace source URL')
    .action(async (url) => {
      const { handler } = await import('../marketplace/commands/remove.js')
      await handler({ url })
    })

  marketplace
    .command('list')
    .description('List configured marketplace sources')
    .action(async () => {
      const { handler } = await import('../marketplace/commands/list.js')
      await handler()
    })

  marketplace
    .command('search <query>')
    .description('Search for plugins across configured marketplace sources')
    .action(async (query) => {
      const { handler } = await import('../marketplace/commands/search.js')
      await handler({ query })
    })

  marketplace
    .command('update [url]')
    .description('Refresh cached marketplace data (all sources if no URL given)')
    .action(async (url) => {
      const { handler } = await import('../marketplace/commands/update.js')
      await handler({ url })
    })

  marketplace
    .command('browse')
    .description('List all plugins from all configured marketplace sources')
    .addOption(new Option('--format <format>', 'output format').choices(['text', 'json']).default('text'))
    .action(async (opts) => {
      const { handler } = await import('../marketplace/commands/browse.js')
      await handler({ format: opts.format })
    })

  // Completions
  const completions = program.command('completions').description('Manage shell tab-completions')

  completions
    .command('bash [args...]')
    .description('Bash completion handler — called by the installed hook at tab-press time.')
    .allowUnknownOption()
    .action(async () => {
      const { bashHandler } = await import('./commands/completions.js')
      bashHandler(program)
    })

  completions
    .command('zsh [words...]')
    .description('Zsh completion handler — called by the installed hook at tab-press time.')
    .allowUnknownOption()
    .action(async (words) => {
      const { zshHandler } = await import('./commands/completions.js')
      zshHandler(['crunes', ...words], program)
    })

  completions
    .command('fish [words...]')
    .description('Fish completion handler — called by the installed hook at tab-press time.')
    .allowUnknownOption()
    .action(async (words) => {
      const { fishHandler } = await import('./commands/completions.js')
      fishHandler(['crunes', ...words], program)
    })

  completions
    .command('powershell [elements...]')
    .description('PowerShell completion handler — called by the installed hook at tab-press time.')
    .allowUnknownOption()
    .action(async (elements) => {
      const { powershellHandler } = await import('./commands/completions.js')
      powershellHandler(['crunes', ...elements], program)
    })

  completions
    .command('install <shell>')
    .description(
      'Append the completion hook for <shell> to your shell profile (idempotent).\n' +
      '  Supported: bash, zsh, fish, powershell\n' +
      '  Examples:\n' +
      '    crunes completions install bash        # appends to ~/.bashrc\n' +
      '    crunes completions install zsh         # appends to ~/.zshrc\n' +
      '    crunes completions install fish        # appends to ~/.config/fish/config.fish\n' +
      '    crunes completions install powershell  # appends to PowerShell $PROFILE'
    )
    .action(async (shell) => {
      const { installHandler } = await import('./commands/completions.js')
      await installHandler(shell)
    })

  return program
}
