/** Tree node builders for structured ASCII or nested markdown list output */
declare namespace tree {
  /**
   * Creates a tree node.
   * @param name Node name shown in the left column
   * @param description Node description shown in the right column
   * @param children Child nodes
   */
  function node(name: string, description: string, children?: TreeNode[]): TreeNode

  /**
   * Formats a tree to a string. style: "tree" (ASCII art, default) or "list" (nested markdown).
   * @param root Root tree node
   * @param options Format options
   */
  function format(root: TreeNode, options?: { style?: 'tree' | 'list'; bullet?: '-' | '*' | '+' }): string

  interface TreeNode {
    name: string
    description: string
    children: TreeNode[]
  }
}
