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
   * Defines the argument and option schema for the runRepl lifecycle.
   * If absent, runRepl(args, input) receives an empty args object.
   * Does NOT fall back to args() — the two lifecycles are independent.
   *
   * @param builder The schema builder to declare options, positionals, and examples.
   * If this export is absent, runRepl(args, input) receives an empty args object — it does NOT fall back to args().
   */
  function argsRepl(builder: ArgBuilder): void | ArgBuilder | any | Promise<void | ArgBuilder | any>

  /**
   * The interactive REPL lifecycle function. Called once per input line.
   * The isolate stays alive across calls — JS closures are the state store.
   *
   * Output via console.log() and utils.section.emit().
   *
   * @param args  Parsed args from argsRepl() schema (built once at session start).
   * @param input The raw string the user typed this turn.
   * @returns A ReplSignal to control the prompt or end the session, or void to continue.
   * Requires a separate "runRepl" permission block in config.json — does not inherit from "run".
   */
  function runRepl(args: ParsedArgs, input: string): Promise<ReplSignal | string | void> | ReplSignal | string | void

  /** Controls the REPL session from inside runRepl(). */
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
