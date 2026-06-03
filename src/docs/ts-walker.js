const KIND_MODULE    = 2
const KIND_NAMESPACE = 4
const KIND_FUNCTION  = 64
const KIND_CLASS     = 128
const KIND_INTERFACE = 256
const KIND_PROPERTY  = 1024
const KIND_METHOD    = 2048
const KIND_CTOR      = 512

function commentText(comment) {
  if (!comment?.summary) return ''
  return comment.summary.map(s => s.text).join('').trim()
}

function paramComment(comment, paramName) {
  const tag = comment?.blockTags?.find(t => t.tag === '@param' && t.name === paramName)
  if (!tag) return ''
  return tag.content.map(c => c.text).join('').trim()
}

function returnsComment(comment) {
  const tag = comment?.blockTags?.find(t => t.tag === '@returns')
  if (!tag) return ''
  return tag.content.map(c => c.text).join('').trim()
}

function typeStr(typeObj) {
  if (!typeObj) return 'unknown'
  if (typeObj.type === 'intrinsic') return typeObj.name
  if (typeObj.type === 'literal')   return JSON.stringify(typeObj.value)
  if (typeObj.type === 'reference') {
    const args = typeObj.typeArguments
    if (args?.length) return `${typeObj.name}<${args.map(typeStr).join(', ')}>`
    return typeObj.name
  }
  if (typeObj.type === 'union')        return typeObj.types.map(typeStr).join(' | ')
  if (typeObj.type === 'intersection') return typeObj.types.map(typeStr).join(' & ')
  if (typeObj.type === 'array')        return `${typeStr(typeObj.elementType)}[]`
  if (typeObj.type === 'reflection')   return reflectionTypeStr(typeObj.declaration)
  return typeObj.type ?? 'unknown'
}

function reflectionTypeStr(decl) {
  if (!decl) return 'object'
  if (decl.signatures?.length) {
    const sig = decl.signatures[0]
    const params = (sig.parameters ?? []).map(p => {
      const opt = p.flags?.isOptional ? '?' : ''
      return `${p.name}${opt}: ${typeStr(p.type)}`
    }).join(', ')
    return `(${params}) => ${typeStr(sig.type)}`
  }
  if (!decl.children?.length) return 'object'
  return `{ ${decl.children.map(c => {
    const opt = c.flags?.isOptional ? '?' : ''
    return `${c.name}${opt}: ${typeStr(c.type)}`
  }).join('; ')} }`
}

function walkParam(p, sigComment) {
  const desc = paramComment(sigComment, p.name) || commentText(p.comment)
  const optional = p.flags?.isOptional ? true : undefined

  if (p.type?.type === 'reflection' && !p.type.declaration?.signatures?.length) {
    const decl = p.type.declaration
    const fields = (decl?.children ?? []).map(c => ({
      name: c.name,
      type: typeStr(c.type),
      description: commentText(c.comment) || undefined,
      ...(c.flags?.isOptional ? { optional: true } : {}),
    }))
    return {
      name: p.name,
      ...(desc ? { description: desc } : {}),
      ...(optional ? { optional } : {}),
      fields,
    }
  }

  return {
    name: p.name,
    type: typeStr(p.type),
    ...(desc ? { description: desc } : {}),
    ...(optional ? { optional } : {}),
  }
}

function walkSignature(sig) {
  return (sig.parameters ?? []).map(p => walkParam(p, sig.comment))
}

function walkProperty(child) {
  const readonly = child.flags?.isReadonly ? true : undefined
  const optional = child.flags?.isOptional ? true : undefined
  return {
    name: child.name,
    type: typeStr(child.type),
    description: commentText(child.comment) || undefined,
    ...(optional ? { optional } : {}),
    ...(readonly ? { readonly } : {}),
  }
}

function walkMethod(child) {
  return (child.signatures ?? []).map(sig => ({
    name: child.name,
    description: commentText(sig.comment) || undefined,
    params: walkSignature(sig),
    returns: typeStr(sig.type),
    returnsDescription: returnsComment(sig.comment) || undefined,
  }))
}

function walkClassOrInterface(child) {
  const properties = (child.children ?? [])
    .filter(c => c.kind === KIND_PROPERTY)
    .map(walkProperty)

  const methods = (child.children ?? [])
    .filter(c => c.kind === KIND_METHOD)
    .flatMap(walkMethod)

  const base = {
    name: child.name,
    description: commentText(child.comment) || undefined,
    properties,
    methods,
  }

  if (child.kind === KIND_CLASS) {
    const ctorChild = (child.children ?? []).find(c => c.kind === KIND_CTOR)
    const ctorSig = ctorChild?.signatures?.[0]
    base.constructor = ctorSig ? walkSignature(ctorSig) : []
  }

  if (child.kind === KIND_INTERFACE) {
    const ext = child.extendedTypes?.[0]
    if (ext) base.extends = typeStr(ext)
  }

  return base
}

function walkChildren(children) {
  const members = []
  for (const child of (children ?? [])) {
    if (child.kind === KIND_NAMESPACE) {
      members.push({
        kind: 'namespace',
        name: child.name,
        description: commentText(child.comment) || undefined,
        members: walkChildren(child.children),
      })
    } else if (child.kind === KIND_FUNCTION) {
      for (const sig of (child.signatures ?? [])) {
        members.push({
          kind: 'function',
          name: child.name,
          description: commentText(sig.comment) || undefined,
          params: walkSignature(sig),
          returns: typeStr(sig.type),
          returnsDescription: returnsComment(sig.comment) || undefined,
        })
      }
    } else if (child.kind === KIND_CLASS) {
      members.push({ kind: 'class', ...walkClassOrInterface(child) })
    } else if (child.kind === KIND_INTERFACE) {
      members.push({ kind: 'interface', ...walkClassOrInterface(child) })
    }
  }
  return members
}

export function walk(typedocJson) {
  const top = typedocJson.children ?? []
  const unwrapped = top.flatMap(c => c.kind === KIND_MODULE ? (c.children ?? []) : [c])
  return unwrapped.map(c => ({
    kind: 'namespace',
    name: c.name,
    description: commentText(c.comment) || undefined,
    members: walkChildren(c.children),
  }))
}
