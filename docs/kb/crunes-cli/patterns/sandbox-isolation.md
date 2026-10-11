---
type: pattern
title: The isolate boundary
description: Every rune runs in a fresh V8 isolate with no Node built-ins, so each capability must be implemented on the host, injected as a reference, and exposed in the bootstrap — and missing any of the three fails silently.
tags: [sandbox, isolated-vm, architecture]
resource: src/rune/isolation/
---

# The isolate boundary

Every rune invocation creates a V8 isolate through `isolated-vm`, evaluates the rune inside it, and tears it down immediately. There is no pooling and no reuse, which keeps teardown trivial and makes state leakage between invocations impossible rather than unlikely.

**Nothing inside the isolate can reach Node.** No `fs`, no `child_process`, no `process`. Everything a rune does to the outside world goes through the `@utils` bridge, and every function on that bridge is a host callback the runner injected.

The bridge is built from **References, not copies.** A rune passes callbacks — to `fs.watch`, to a REPL input handler — and a function cannot be serialised across the isolate boundary. A reference can be called back through; a copy cannot.

## Adding a capability is three edits

This is the pattern's operational consequence and the thing most likely to go wrong:

1. **Implement it on the host** in `src/rune/api/<namespace>.js`, where it has real Node access.
2. **Inject it in the runner** as `$__utils_<name>`, an `ivm.Reference` set on the jail.
3. **Expose it in the bootstrap**, `src/rune/isolation/utils-bootstrap.js`, where the in-isolate `@utils` object is assembled and the reference is applied.

**Missing any one of the three fails silently.** Implement without injecting and the bootstrap references nothing. Inject without exposing and the rune sees no such function. Neither produces an error naming the mistake; the capability is simply absent.

Declaring its types is a fourth edit in practice, because `src/rune/api/types-utils/*.d.ts` is what generates the API reference — a capability missing from there works but is undocumented, and the documentation is [generated rather than written](/modules/docs.md).

## Static modules are compiled from source strings

The built-in modules a rune imports are held as source strings and compiled into the isolate at runtime. They stay genuinely sandboxed while remaining real ESM modules that can import one another, which a host-side shim could not offer.

`$__hostRequire` exists during evaluation so those builtins can resolve each other, and is **deleted immediately after evaluation completes.** Removing it earlier breaks the builtins; leaving it in place is a sandbox escape for rune code that runs later.

## Why not a worker or a subprocess

A worker thread shares the process and its module registry, so the isolation would be by convention. A subprocess per rune isolates properly but pays process startup on every call and makes the capability bridge an IPC protocol rather than a function call — the same three edits, plus serialisation, plus a wire format to version.

The cost actually paid is that **the boundary is easy to widen by accident.** Every injected reference is a hole with a permission check in front of it, and the check is the only thing making the hole safe. A capability added without one is not a missing feature, it is an open door.
