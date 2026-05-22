/** Markdown string builders. Pure helpers for constructing markdown output. */
declare namespace md {
  /** Renders a # level-1 heading */
  function h1(text: string): string
  /** Renders a ## level-2 heading */
  function h2(text: string): string
  /** Renders a ### level-3 heading */
  function h3(text: string): string
  /** Renders a paragraph */
  function p(text: string): string
  /** Wraps text in **bold** */
  function bold(text: string): string
  /** Wraps text in _italic_ */
  function italic(text: string): string
  /** Wraps text in `inline code` */
  function code(text: string): string
  /**
   * Wraps text in a fenced code block.
   * @param text Code content
   * @param lang Language identifier (optional)
   */
  function codeBlock(text: string, lang?: string): string
  /** Renders an unordered list */
  function ul(items: string[]): string
  /** Renders an ordered list */
  function ol(items: string[]): string
  /**
   * Renders a markdown hyperlink.
   * @param text Link label
   * @param url Link URL
   */
  function link(text: string, url: string): string
  /**
   * Renders a markdown table.
   * @param headers Column headers
   * @param rows Array of row arrays
   */
  function table(headers: string[], rows: string[][]): string
}
