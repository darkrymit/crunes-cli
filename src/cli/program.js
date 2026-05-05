import path from 'node:path'
import { Command, Option } from 'commander'
import { configure as configureOutput } from '../shared/output.js'

export function buildProgram() {
  const program = new Command()

  program
    .name('crunes')
    .description('CLI tool for managing context runes')
    .version('0.4.6', '-v, --version')
    .option('-y, --yes', 'assume yes to all prompts and skip interactive mode (also auto-detected in non-TTY environments)')
    .option('-p, --plain', 'plain output: no colors, no box-drawing, plain symbols — optimised for AI/pipe use')
    .option('--cwd <path>', 'project root to use instead of the current working directory')
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

  program
    .command('use <rune>')
    .description(
      'Use one or more runes and output the result.\n' +
      '  Key format: [source:]name[=arg1,arg2][::section1,section2]\n' +
      '  local:name  — resolve from project config only\n' +
      '  plugin:name — resolve directly from an enabled plugin\n' +
      '  name        — auto-resolve: project config first, then enabled plugins'
    )
    .addOption(new Option('--format <format>', 'output format').choices(['md', 'json']).default('md'))
    .option('-a, --and <rune>', 'add another rune key to the batch (repeatable)', (val, acc) => [...acc, val], [])
    .option('--fail-fast', 'stop on first rune error (default: run all, exit 1 if any failed)')
    .action(async (key, opts) => {
      const { handler } = await import('../rune/commands/use.js')
      const keys = [key, ...opts.and]
      await handler({ keys, format: opts.format, failFast: !!opts.failFast, projectRoot: projectRoot() })
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
    .command('check <rune>')
    .description('Run a rune and validate its output shape')
    .action(async (key) => {
      const { handler } = await import('../rune/commands/check.js')
      await handler({ key, projectRoot: projectRoot() })
    })

  program
    .command('bench [rune]')
    .description(
      'Time rune execution and report which runes are fast, ok, or slow.\n' +
      '  Benchmarks all registered runes when no key is given.\n' +
      '  Key supports local:name, plugin:name, or bare name (same as crunes use).'
    )
    .option('--runs <n>', 'number of runs to average (default: 1)', v => parseInt(v, 10), 1)
    .action(async (key, opts) => {
      const { handler } = await import('../rune/commands/benchmark.js')
      await handler({ key, runs: opts.runs, plain: !!program.opts().plain, projectRoot: projectRoot() })
    })

  program
    .command('list')
    .description('List all registered runes')
    .addOption(new Option('--format <format>', 'output format').choices(['md', 'json']).default('md'))
    .action(async (opts) => {
      const { handler } = await import('../rune/commands/list.js')
      await handler({ format: opts.format, plain: !!program.opts().plain, projectRoot: projectRoot() })
    })

  program
    .command('init')
    .description('Create .crunes/config.json in the current project')
    .action(async () => {
      const { handler } = await import('../rune/commands/init.js')
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
      await handler({ key, format: opts.format, path: opts.path, name: opts.name, description: opts.description, yes: !!program.opts().yes, projectRoot: projectRoot() })
    })

  // Plugin management commands
  const plugin = program.command('plugin').description('Manage rune plugins')

  plugin
    .command('install <source>')
    .description('Install a plugin from a local path, GitHub repo (owner/repo), git URL, or npm package')
    .action(async (source) => {
      const { handler } = await import('../plugin/commands/install.js')
      await handler({ source, projectRoot: projectRoot() })
    })

  plugin
    .command('uninstall <plugin>')
    .description('Uninstall an installed plugin')
    .action(async (name) => {
      const { handler } = await import('../plugin/commands/uninstall.js')
      await handler({ name, yes: !!program.opts().yes, projectRoot: projectRoot() })
    })

  plugin
    .command('list')
    .description('List installed plugins')
    .addOption(new Option('--format <format>', 'output format').choices(['md', 'json']).default('md'))
    .action(async (opts) => {
      const { handler } = await import('../plugin/commands/list.js')
      await handler({ format: opts.format })
    })

  plugin
    .command('update [plugin]')
    .description('Update one or all installed plugins')
    .action(async (name) => {
      const { handler } = await import('../plugin/commands/update.js')
      await handler({ name, projectRoot: projectRoot() })
    })

  plugin
    .command('enable <plugin>')
    .description('Add a plugin to this project\'s enabled list')
    .action(async (name) => {
      const { handler } = await import('../plugin/commands/enable.js')
      await handler({ name, projectRoot: projectRoot() })
    })

  plugin
    .command('disable <plugin>')
    .description('Remove a plugin from this project\'s enabled list')
    .action(async (name) => {
      const { handler } = await import('../plugin/commands/disable.js')
      await handler({ name, projectRoot: projectRoot() })
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
    .description('List available templates. [template-source] can be "local" (project config only) or a plugin name; omit to list all.')
    .addOption(new Option('--format <format>', 'output format').choices(['md', 'json']).default('md'))
    .action(async (source, opts) => {
      const { handler } = await import('../template/commands/list.js')
      await handler({ source, format: opts.format, plain: !!program.opts().plain, projectRoot: projectRoot() })
    })

  template
    .command('use <template>')
    .description(
      'Copy a template into the project as a new rune and register it in config.\n' +
      '  local:name  — use a template defined in this project\'s config\n' +
      '  plugin:name — use a template from a specific installed plugin\n' +
      '  name        — auto-resolve: project config first, then installed plugins'
    )
    .option('--as <new-rune>', 'register the rune under a different key (default: template name)')
    .option('--path <path>', 'file path for the rune (default: .crunes/runes/<key>.js)')
    .option('--name <name>', 'human-readable label shown in crunes list')
    .option('--description <description>', 'short description of what context this rune provides')
    .action(async (ref, opts) => {
      const { handler } = await import('../template/commands/use.js')
      await handler({ ref, key: opts.as, path: opts.path, name: opts.name, description: opts.description, yes: !!program.opts().yes, projectRoot: projectRoot() })
    })

  template
    .command('create [new-template]')
    .description('Scaffold a new template file and register it in config')
    .option('--path <path>', 'file path for the template (default: .crunes/templates/<name>.js)')
    .option('--name <name>', 'display label shown in crunes template list (separate from the template key)')
    .option('--description <description>', 'short description of what kind of rune this template produces')
    .action(async (name, opts) => {
      const { handler } = await import('../template/commands/create.js')
      await handler({ name, path: opts.path, templateName: opts.name, description: opts.description, yes: !!program.opts().yes, projectRoot: projectRoot() })
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
    .addOption(new Option('--format <format>', 'output format').choices(['md', 'json']).default('md'))
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
