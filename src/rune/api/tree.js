export function node(name, description, children = []) {
  return { name, description, children };
}

/**
 * Formats a tree node to a string.
 * options.style: 'tree' (default, ASCII art) | 'list' (nested markdown list)
 * options.bullet: '-' (default) | '*' | '+'  — only used for 'list' style
 */
export function format(root, options = {}) {
  const { style = 'tree', bullet = '-' } = options;
  if (style === 'list') return formatList(root, bullet, 0);
  return formatTree(root);
}

function formatTree(root) {
  if (!root) return '';
  const lines = [`${root.name.padEnd(12)}${root.description}`];
  appendTreeChildren(root.children ?? [], '', lines);
  return lines.join('\n');
}

function appendTreeChildren(children, prefix, lines) {
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isLast = i === children.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    lines.push(`${prefix}${connector}${child.name.padEnd(12)}${child.description}`);
    appendTreeChildren(child.children ?? [], childPrefix, lines);
  }
}

function formatList(node, bullet, depth) {
  const indent = '  '.repeat(depth);
  const lines = [`${indent}${bullet} **${node.name}** — ${node.description}`];
  for (const child of (node.children ?? [])) {
    lines.push(formatList(child, bullet, depth + 1));
  }
  return lines.join('\n');
}
