export function h1(text) { return `# ${text}\n`; }
export function h2(text) { return `## ${text}\n`; }
export function h3(text) { return `### ${text}\n`; }
export function p(text) { return `${text}\n`; }
export function bold(text) { return `**${text}**`; }
export function italic(text) { return `_${text}_`; }
export function code(text) { return `\`${text}\``; }

export function codeBlock(text, lang = '') {
  return `\`\`\`${lang}\n${text}\n\`\`\`\n`;
}

export function ul(items) {
  return items.map(i => `- ${i}`).join('\n') + '\n';
}

export function ol(items) {
  return items.map((i, n) => `${n + 1}. ${i}`).join('\n') + '\n';
}

export function link(text, url) {
  return `[${text}](${url})`;
}

export function table(headers, rows) {
  const sep = headers.map(() => '---');
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map(r => `| ${r.join(' | ')} |`),
  ];
  return lines.join('\n') + '\n';
}

export function blockquote(text) {
  return text.split('\n').map(line => `> ${line}`).join('\n') + '\n';
}
