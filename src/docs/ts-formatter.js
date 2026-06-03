function indentDesc(desc, indent) {
  return desc.split('\n').join('\n' + indent)
}

function sigLineTyped(name, params, returns) {
  const args = (params ?? []).map(p => {
    if (p.fields) {
      // reflection object param — show as name?: { fields }
      const opt = p.optional ? '?' : ''
      const fields = p.fields.map(f => `${f.name}${f.optional ? '?' : ''}: ${f.type}`).join('; ')
      return `${p.name}${opt}: { ${fields} }`
    }
    const opt = p.optional ? '?' : ''
    return p.type ? `${p.name}${opt}: ${p.type}` : `${p.name}${opt}`
  }).join(', ')
  const ret = returns && returns !== 'void' ? `: ${returns}` : ''
  return `${name}(${args})${ret}`
}

function renderParams(params, indent) {
  // Only emit Parameters: block when at least one param has a description
  const withDesc = (params ?? []).filter(p => p.description || p.fields?.some(f => f.description))
  if (!withDesc.length) return []
  const lines = [`${indent}Parameters:`]
  for (const p of (params ?? [])) {
    if (!p.description && !p.fields?.some(f => f.description)) continue
    if (p.fields) {
      const opt = p.optional ? '?' : ''
      lines.push(`${indent}  ${p.name}${opt}${p.description ? ' ' + indentDesc(p.description, indent + '  ') : ''}`)
      for (const f of p.fields) {
        if (!f.description) continue
        const fopt = f.optional ? '?' : ''
        lines.push(`${indent}    ${f.name}${fopt} ${indentDesc(f.description, indent + '    ')}`)
      }
    } else {
      const opt = p.optional ? '?' : ''
      lines.push(`${indent}  ${p.name}${opt} ${indentDesc(p.description, indent + '  ')}`)
    }
  }
  return lines
}

function renderFunctionBody(node, indent) {
  const lines = []
  if (node.description) lines.push(`${indent}  ${indentDesc(node.description, indent + '  ')}`)
  const paramLines = renderParams(node.params, `${indent}  `)
  if (paramLines.length) lines.push(...paramLines)
  if (node.returnsDescription) lines.push(`${indent}  Returns: ${indentDesc(node.returnsDescription, indent + '  ')}`)
  return lines
}

function renderFunction(node, indent) {
  const lines = []
  lines.push(`${indent}${sigLineTyped(node.name, node.params, node.returns)}`)
  lines.push(...renderFunctionBody(node, indent))
  return lines.join('\n')
}

function renderProperty(p, indent) {
  const ro = p.readonly ? 'readonly ' : ''
  const opt = p.optional ? '?' : ''
  return `${indent}${ro}${p.name}${opt} ${p.type}${p.description ? ' ' + indentDesc(p.description, indent) : ''}`
}

function renderMethods(methods, indent) {
  if (!methods?.length) return []
  const lines = []
  let i = 0
  while (i < methods.length) {
    const m = methods[i]
    const overloads = [m]
    while (i + overloads.length < methods.length && methods[i + overloads.length].name === m.name) {
      overloads.push(methods[i + overloads.length])
    }
    lines.push('')
    if (overloads.length > 1) {
      // Fully typed overload lines — nothing below
      for (const o of overloads) {
        lines.push(`${indent}${sigLineTyped(o.name, o.params, o.returns)}`)
      }
    } else {
      lines.push(`${indent}${sigLineTyped(m.name, m.params, m.returns)}`)
      lines.push(...renderFunctionBody(m, indent))
    }
    i += overloads.length
  }
  return lines
}

function renderClassOrInterface(node, indent) {
  const lines = []
  const heading = node.kind === 'class'
    ? `${indent}${sigLineTyped(node.name, node.constructor ?? [], undefined)}`
    : node.extends
      ? `${indent}${node.name} extends ${node.extends}`
      : `${indent}${node.name}`
  lines.push(heading)
  if (node.description) {
    lines.push(`${indent}  ${indentDesc(node.description, indent + '  ')}`)
    if (node.properties?.length || node.methods?.length) lines.push('')
  }
  const hasProps = (node.properties ?? []).length > 0
  for (const p of (node.properties ?? [])) {
    lines.push(renderProperty(p, `${indent}  `))
  }
  const methodLines = renderMethods(node.methods ?? [], `${indent}  `)
  // renderMethods starts with a blank line per group; skip it when something already added a blank above
  const skipLeadingBlank = methodLines.length && !hasProps
  lines.push(...(skipLeadingBlank ? methodLines.slice(1) : methodLines))
  return lines.join('\n')
}

function renderNamespace(node, { prefix = '', indent = '' } = {}) {
  const heading = prefix ? `${prefix}.${node.name}` : node.name
  const lines = []
  lines.push(`${indent}${heading}`)
  if (node.description) lines.push(`${indent}  ${indentDesc(node.description, indent + '  ')}`)
  lines.push('')
  lines.push(formatMembers(node.members, { prefix: heading, indent: `${indent}  ` }))
  return lines.join('\n')
}

export function formatNode(node, { prefix = '', indent = '' } = {}) {
  switch (node.kind) {
    case 'namespace': return renderNamespace(node, { prefix, indent })
    case 'function':  return renderFunction(node, indent)
    case 'class':
    case 'interface': return renderClassOrInterface(node, indent)
    default:          return ''
  }
}

export function formatMembers(members, { prefix = '', indent = '' } = {}) {
  return (members ?? [])
    .map(m => formatNode(m, { prefix, indent }))
    .filter(Boolean)
    .join('\n\n')
}
