/**
 * Renders a single data object to a plain string.
 * Used by hook-wrapper (inline) and renderSection (below).
 */
export function render(data) {
  if (!data) return null;
  if (data.type === 'tree') return renderTree(data.root);
  if (data.type === 'markdown') return data.content ?? null;
  return null;
}

/**
 * Renders a Section object to CLI md output:
 *
 *   ## {title or name}
 *   [{k}: {v}] ...        ← omitted if attrs empty
 *   {rendered data}
 */
export function renderSection(section) {
  const parts = [];

  if (section.title) {
    parts.push(`## ${section.title}`);
  } else if (section.name) {
    parts.push(`## ${section.name}`);
  } else {
    parts.push('## (no title)');
  }

  if (section.attrs && Object.keys(section.attrs).length > 0) {
    const attrStr = Object.entries(section.attrs)
      .map(([k, v]) => `[${k}: ${v}]`)
      .join(' ');
    parts.push(attrStr);
  }

  const content = render(section.data);
  if (content) {
    if (section.data?.type === 'markdown') {
      parts.push('```md\n' + content + '\n```');
    } else {
      parts.push(content);
    }
  }

  return parts.filter(Boolean).join('\n') || null;
}

function renderTree(root) {
  if (!root) return null;
  const lines = [`${root.name.padEnd(12)}${root.description}`];
  appendChildren(root.children ?? [], '', lines);
  return lines.join('\n');
}

function appendChildren(children, prefix, lines) {
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isLast = i === children.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    lines.push(`${prefix}${connector}${child.name.padEnd(12)}${child.description}`);
    appendChildren(child.children ?? [], childPrefix, lines);
  }
}
