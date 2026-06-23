/** @deprecated Use the `rune` namespace instead: rune.helpText(), rune.helpSection() */
declare namespace help {
  /** @deprecated Use rune.helpText() instead. */
  export function text(): string

  /** @deprecated Use rune.helpSection() instead. */
  export function section(): RuneSection
}
