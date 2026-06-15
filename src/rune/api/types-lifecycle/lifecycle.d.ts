/**
 * Rune Lifecycle Entrypoint Methods
 *
 * These are the standard ES module exports required or supported by the Crunes execution engine.
 */
declare namespace lifecycle {
  /**
   * Defines the argument and option schema for the rune.
   * Called by the runner in a minimal bootstrap isolate to compile usage specifications.
   *
   * @param builder The schema builder to declare options, positionals, and examples.
   */
  function args(builder: ArgBuilder): void | ArgBuilder | any | Promise<void | ArgBuilder | any>

  /**
   * The main execution lifecycle function of the rune.
   *
   * @param args Parsed yargs-parser arguments.
   * @returns A single section, an array of sections, a plain string, or void.
   */
  function run(args: ParsedArgs): Promise<RuneSection[] | RuneSection | string | void> | RuneSection[] | RuneSection | string | void

  /**
   * Optional cleanup hook for the regular run lifecycle.
   * Called after run() resolves or throws, before the isolate tears down.
   * Errors thrown here are swallowed. No arguments are passed.
   * Use this to close connections or release resources opened during run().
   */
  function dispose(): Promise<void> | void

  /**
   * Defines the argument and option schema for the REPL session.
   * If absent, repl(args) receives an empty args object — it does NOT fall back to args().
   *
   * @param builder The schema builder to declare options, positionals, and examples.
   */
  function argsRepl(builder: ArgBuilder): void | ArgBuilder | any | Promise<void | ArgBuilder | any>

  /**
   * REPL session initializer. Called once at session start before the first prompt.
   * The right place to open connections and set up module-level state.
   * Returns the initial prompt string, or void for the default "> ".
   * Requires a separate "repl" permission block in config.json — does not inherit from "run".
   *
   * @param args Parsed args from argsRepl() schema.
   * @returns Initial prompt string, or void to use "> ".
   */
  function repl(args: ParsedArgs): Promise<string | void> | string | void

  /**
   * Welcome banner. Called once after repl() resolves, before the first prompt.
   * Printed to stderr in text mode; emitted as { type: "banner" } in JSONL mode.
   *
   * @param args Parsed args from argsRepl() schema.
   * @returns Banner string, or void for no banner.
   */
  function bannerRepl(args: ParsedArgs): Promise<string | void> | string | void

  /**
   * Declares slash commands available in the REPL session.
   * Only .command() declarations at the root level are used — .option() and .positional() at root are ignored.
   * Matched commands are dispatched to inputRepl() as { type: "command", args: ParsedArgs }.
   *
   * @param builder The schema builder — use only .command() at root level.
   */
  function commandsRepl(builder: ArgBuilder): void | ArgBuilder | any | Promise<void | ArgBuilder | any>

  /**
   * Per-input handler. Called once per InputEvent for the lifetime of the REPL session.
   * The isolate stays alive across calls — JS module-level variables are session state.
   * Output via console.log() and utils.section.emit().
   *
   * @param input The input event for this turn.
   * @returns A ReplSignal to control the prompt or end the session, or void to continue.
   */
  function inputRepl(input: InputEvent): Promise<ReplSignal | string | void> | ReplSignal | string | void

  /**
   * Tab completion. Called on Tab key with the current input tokenized.
   * Last element of tokens is the partial word being typed — same convention as resolveCompletions().
   * Returns candidate strings; host filters by prefix and passes to readline.
   *
   * @param tokens Current input split on whitespace; last element is the partial word.
   * @returns Array of completion candidates.
   */
  function completeInputRepl(tokens: string[]): Promise<string[]> | string[]

  /**
   * Optional cleanup hook for REPL sessions.
   * Called when the session's dispose() method is invoked (on normal exit, Ctrl+D, or signal).
   * Guaranteed to run even if inputRepl() never receives an eof event.
   * Errors thrown here are swallowed. No arguments are passed.
   */
  function disposeRepl(): Promise<void> | void

  /** Input event passed to inputRepl() each turn. */
  type InputEvent =
    | { type: 'line';      text: string }     // normal input line (raw, untrimmed)
    | { type: 'interrupt'; text: '' }         // Ctrl+C on empty prompt
    | { type: 'eof';       text: '' }         // Ctrl+D or stdin closed
    | { type: 'command';   args: ParsedArgs } // matched slash command

  /** Controls the REPL session from inside inputRepl(). */
  type ReplSignal =
    | { type: 'prompt'; value?: string }   // continue with optional custom prompt
    | { type: 'done'; message?: string }   // end the session

  /** Fluent builder for defining rune options, positionals, and examples. */
  interface ArgBuilder {
    /**
     * Declares a named option/flag.
     *
     * @param flags Flag specification (e.g., '--verbose' or '-n, --name <name>').
     * @param description A brief description of this option.
     * @param defaultValue Optional default value for the option.
     */
    option(flags: string, description: string, defaultValue?: any): this

    /**
     * Declares a positional argument.
     *
     * @param spec Positional argument specification (e.g., '<name>' for required, '[name]' for optional, '<targets...>' or '[targets...]' for variadic rest arrays).
     * @param description A brief description of this positional argument.
     */
    positional(spec: string, description: string): this

    /**
     * Adds an example command showing how to call the rune.
     *
     * @param usage Usage example string (e.g. 'crunes run hello world').
     * @param description A brief description of the example.
     */
    example(usage: string, description: string): this

    /**
     * Declares a nested command under the current command.
     *
     * @param name Command name (e.g. 'create').
     * @param description Command description.
     * @param callback Callback configured with a subcommand ArgBuilder.
     */
    command(name: string, description: string, callback?: (sub: ArgBuilder) => void): this

    /**
     * Finalizes and builds the argument schema.
     */
    build(): any
  }

  /** Parsed yargs-parser arguments passed to the rune's run() function. */
  interface ParsedArgs extends Record<string, any> {
    /** Positional arguments in order. */
    _: string[]

    /** Positional arguments not mapped to any named parameters. */
    $rest: string[]

    /** Original raw arguments passed to the rune. */
    $raw: string[]

    /** Space-separated matched command path string (e.g. 'remote add'). Only present when a subcommand matched. */
    $command?: string

    /** Array of matched command path levels (e.g. ['remote', 'add']). Only present when a subcommand matched. */
    $commands?: string[]
  }
}
