import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractCwd(tokens) {
  const idx = tokens.indexOf('--cwd')
  if (idx !== -1 && idx + 1 < tokens.length) return path.resolve(tokens[idx + 1])
  return process.cwd()
}

function loadRuneKeys(dir) {
  try {
    const configPath = path.join(dir, '.crunes', 'config.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return Object.keys(config.runes ?? {})
  } catch { return [] }
}

function loadPluginNames() {
  try {
    const pluginsPath = path.join(os.homedir(), '.crunes', 'plugins.json')
    const registry = JSON.parse(fs.readFileSync(pluginsPath, 'utf8'))
    return Object.keys(registry.plugins ?? {})
  } catch { return [] }
}

function logDebug(err) {
  if (process.env.CRUNES_COMPLETION_DEBUG !== '1') return
  try {
    const line = `[${new Date().toISOString()}] ${err?.stack ?? err}\n`
    fs.appendFileSync(path.join(os.tmpdir(), 'crunes-completion.log'), line)
  } catch { /* ignore */ }
}

// ─── Core Dynamic Resolver ────────────────────────────────────────────────────

export function resolveCompletions(tokens, program, { cwd } = {}) {
  const resolvedCwd = cwd ?? extractCwd(tokens)
  const args = tokens.slice(1) // Remove 'crunes'
  const partialWord = args.length > 0 ? args[args.length - 1] : ''
  const prevWord = args.length > 1 ? args[args.length - 2] : ''

  let currentCmd = program
  const positionalArgs = []
  let skipNext = false

  const getOpt = (cmd, word) => cmd.options.find(o => o.short === word || o.long === word)
      ?? program.options.find(o => o.short === word || o.long === word)

  // 1. Walk the AST (Now strictly aware of `=` attached values)
  for (let i = 0; i < args.length - 1; i++) {
    if (skipNext) { skipNext = false; continue }

    const arg = args[i]

    if (arg.startsWith('-')) {
      const hasEquals = arg.includes('=')
      const flagName = hasEquals ? arg.split('=')[0] : arg
      const opt = getOpt(currentCmd, flagName)

      // If it takes a value and didn't use `=`, skip the next word
      if (opt && (opt.required || opt.optional) && !hasEquals) skipNext = true
      continue
    }

    const nextCmd = currentCmd.commands.find(c => c.name() === arg || c.aliases().includes(arg))
    if (nextCmd) {
      currentCmd = nextCmd
      positionalArgs.length = 0 // Reset args because we entered a subcommand
    } else {
      positionalArgs.push(arg)
    }
  }

  const candidates = new Set()

  // 2. Identify if we are completing a flag value (Handles both space and `=` syntax)
  let activeOpt = null
  let matchTarget = partialWord
  let prefix = '' // To prepend `--flag=` back onto the result

  if (partialWord.startsWith('-') && partialWord.includes('=')) {
    // User is typing `--format=m...`
    const idx = partialWord.indexOf('=')
    const flagName = partialWord.slice(0, idx)
    activeOpt = getOpt(currentCmd, flagName)
    matchTarget = partialWord.slice(idx + 1)
    prefix = flagName + '='
  } else if (!prevWord.includes('=')) {
    // User typed `--format m...` (If prevWord had '=', the value is already complete)
    activeOpt = getOpt(currentCmd, prevWord)
  }

  // 3. Explicit Flag Value Mapping
  if (activeOpt) {
    let optCandidates = []

    if (activeOpt.argChoices?.length) optCandidates = [...activeOpt.argChoices]
    else if (activeOpt.flags.includes('<rune>')) optCandidates = loadRuneKeys(resolvedCwd)

    if (optCandidates.length > 0) {
      // Stitch the prefix back on so the terminal correctly replaces the whole word!
      return optCandidates
          .filter(c => c.startsWith(matchTarget))
          .map(c => prefix + c)
    }

    // Native File Fallback for all other flags
    if (activeOpt.required || activeOpt.optional) return []
  }

  // 4. Suggest Flags (Only if they aren't currently typing after an `=`)
  if (partialWord.startsWith('-') && !partialWord.includes('=')) {
    const addOpts = (cmd) => cmd.options.forEach(opt => {
      if (opt.long) candidates.add(opt.long)
      if (opt.short) candidates.add(opt.short)
    })
    addOpts(currentCmd)
    if (currentCmd !== program) addOpts(program) // Inject global flags
    return Array.from(candidates).filter(c => c.startsWith(partialWord))
  }

  // 5. Match cursor position to Commander's registered arguments
  const argDefs = currentCmd.registeredArguments
  let targetArgIndex = positionalArgs.length

  if (argDefs.length > 0 && targetArgIndex >= argDefs.length && argDefs[argDefs.length - 1].variadic) {
    targetArgIndex = argDefs.length - 1
  }

  const argDef = argDefs[targetArgIndex]

  // 6. Global Keys Mapping!
  if (argDef) {
    const argName = argDef.name()

    if (argName === 'rune') loadRuneKeys(resolvedCwd).forEach(k => candidates.add(k))
    else if (argName === 'plugin') loadPluginNames().forEach(p => candidates.add(p))
    else if (argName === 'template-source') {
      candidates.add('local')
      loadPluginNames().forEach(p => candidates.add(p))
    }
    else if (argName === 'shell') {
      ['bash', 'zsh', 'fish', 'powershell'].forEach(s => candidates.add(s))
    }
  }

  // 7. Suggest Subcommands
  if (!argDef || currentCmd.commands.length > 0) {
    currentCmd.commands.forEach(cmd => candidates.add(cmd.name()))
  }

  return Array.from(candidates).filter(c => c.startsWith(partialWord))
}

// ─── Shell handlers ───────────────────────────────────────────────────────────

function outputCandidates(candidates) {
  if (candidates.length > 0) process.stdout.write(candidates.join('\n') + '\n')
}

export function zshHandler(words, program) {
  try {
    const tokens = Array.isArray(words) ? words : []
    outputCandidates(resolveCompletions(tokens, program))
  } catch (err) { logDebug(err) }
}

export function fishHandler(words, program) {
  try {
    const tokens = Array.isArray(words) ? words : []
    outputCandidates(resolveCompletions(tokens, program))
  } catch (err) { logDebug(err) }
}

export function powershellHandler(elements, program) {
  try {
    const line = process.env.CRUNES_COMP_LINE ?? elements[0] ?? ''
    const point = parseInt(process.env.CRUNES_COMP_POINT ?? elements[1] ?? String(line.length), 10)

    const partial = line.slice(0, point)
    const tokens = partial.split(/\s+/).filter((t, i, arr) => i < arr.length - 1 || t !== '')
    if (partial.endsWith(' ')) tokens.push('')

    outputCandidates(resolveCompletions(tokens, program))
  } catch (err) { logDebug(err) }
}

export function bashHandler(program) {
  try {
    const compLine = process.env.COMP_LINE ?? ''
    const compPoint = parseInt(process.env.COMP_POINT ?? String(compLine.length), 10)
    const partial = compLine.slice(0, compPoint)
    const tokens = partial.split(/\s+/).filter((t, i, arr) => i < arr.length - 1 || t !== '')
    if (partial.endsWith(' ')) tokens.push('')

    const candidates = resolveCompletions(tokens, program)

    // bash splits on '=' (COMP_WORDBREAKS), so it replaces only the part after '='.
    // Strip the 'flag=' prefix from candidates so bash doesn't double-insert it.
    const lastToken = tokens[tokens.length - 1] ?? ''
    const eqIdx = lastToken.indexOf('=')
    if (eqIdx !== -1) {
      const bashPrefix = lastToken.slice(0, eqIdx + 1)
      outputCandidates(candidates.filter(c => c.startsWith(bashPrefix)).map(c => c.slice(bashPrefix.length)))
    } else {
      outputCandidates(candidates)
    }
  } catch (err) { logDebug(err) }
}

// ─── Installation hooks ───────────────────────────────────────────────────────

const HOOKS = {
  bash:       "complete -C 'crunes completions bash' crunes\n",
  zsh:        "compdef '_comps=(\"${(@f)$(crunes completions zsh \"${(@)words}\")}\"); compadd -a _comps' crunes\n",
  fish:       "complete -c crunes -f -a \"(crunes completions fish (commandline -opc))\"\n",
  powershell: "Register-ArgumentCompleter -Native -CommandName crunes -ScriptBlock { param($w,$ast,$pos); $line = $ast.Extent.Text; if ([string]::IsNullOrEmpty($w)) { $line += ' ' }; $env:CRUNES_COMP_LINE = $line; $env:CRUNES_COMP_POINT = $pos; $res = & crunes completions powershell; if ($res) { $res | Where-Object { $_ -like \"$w*\" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) } } }\n",
}

function defaultProfilePath(shell) {
  const home = os.homedir()
  if (shell === 'bash') return path.join(home, '.bashrc')
  if (shell === 'zsh') return path.join(home, '.zshrc')
  if (shell === 'fish') return path.join(home, '.config', 'fish', 'config.fish')

  if (shell === 'powershell') {
    if (process.platform === 'win32') {
      const pwshCorePath = path.join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1')
      const winPwshPath = path.join(home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1')
      if (fs.existsSync(path.dirname(pwshCorePath))) return pwshCorePath
      return winPwshPath
    } else {
      return path.join(home, '.config', 'powershell', 'Microsoft.PowerShell_profile.ps1')
    }
  }
}

export async function installHandler(shell, { profilePath } = {}) {
  const hook = HOOKS[shell]
  if (!hook) throw new Error(`Unknown shell: ${shell}. Supported: bash, zsh, fish, powershell`)

  const target = profilePath ?? defaultProfilePath(shell)
  await fsPromises.mkdir(path.dirname(target), { recursive: true })

  let existing = ''
  try {
    existing = await fsPromises.readFile(target, 'utf8')
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  const hookLine = hook.trim()
  if (existing.includes(hookLine)) {
    console.log(`crunes completions already present in ${target}`)
    return
  }

  await fsPromises.appendFile(target, (existing.length ? '\n' : '') + hook)
  console.log(`crunes completions installed in ${target}`)
  console.log(`Restart your shell or run: source ${target}`)
}