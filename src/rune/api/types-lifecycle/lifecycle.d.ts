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
  function use(args: ParsedArgs): Promise<RuneSection[] | RuneSection | string | void> | RuneSection[] | RuneSection | string | void

  /** Minimal section shape returned by rune execution */
  interface RuneSection {
    name: string
    data: { type: string; content?: string; root?: object }
    title?: string
    attrs?: Record<string, string>
  }

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
     * @param spec Positional argument specification (e.g., '<name>' for required, '[name]' for optional).
     * @param description A brief description of this positional argument.
     */
    positional(spec: string, description: string): this

    /**
     * Adds an example command showing how to call the rune.
     * 
     * @param usage Usage example string (e.g. 'crunes use hello world').
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

  /** Parsed yargs-parser arguments passed to the rune's use() function. */
  interface ParsedArgs extends Record<string, any> {
    /** Positional arguments in order. */
    _: string[]

    /** Original raw arguments passed to the rune. */
    $raw: string[]

    /** Space-separated matched command path string (e.g. 'remote add') */
    command?: string

    /** Array of matched command path levels (e.g. ['remote', 'add']) */
    commands?: string[]
  }
}
