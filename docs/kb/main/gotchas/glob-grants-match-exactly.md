---
type: gotcha
title: An fs.glob grant matches the pattern string, not the paths
description: The granted pattern must equal the pattern the call passes, with only fs.glob:* acting as a wildcard, so the broadest-looking grant fails while a narrower one works.
tags: [permissions, fs, glob]
resource: src/rune/permissions/permissions.js
---

# An `fs.glob` grant matches the pattern string, not the paths

`fs.glob` permissions are stored as `cwd::pattern`. The **cwd half is glob-matched**; the **pattern half is compared for equality**, with `*` on its own as the single exception meaning *any pattern*.

So this is denied:

```
grant:   fs.glob:./**
call:    fs.glob('./**/*.js')
         'fs.glob:./**/*.js' is not permitted.
```

and all of `fs.glob:./**`, `fs.glob:./**/*`, `fs.glob:**` and `fs.glob:./*.js` are denied for that same call, while `fs.glob:./**/*.js` and `fs.glob:*` are allowed.

**The broadest-looking grant is the one that fails.** Every other capability's documentation says `*` matches any characters, so the natural move is to grant `./**` and widen from there — which is precisely the grant that cannot work. Two independent fresh-agent reviews hit this, and neither could get past it from the CLI's output alone.

## Why it is this way

A grant is checked against the pattern the rune *asks with*, before anything is resolved. If patterns were glob-matched against each other, `./**` would subsume every narrower pattern and a grant meant to be specific could be widened by a cleverly shaped runtime pattern. Equality keeps the grant exactly as auditable as it reads.

The consequence for rune authors is the real rule: **glob patterns a rune declares up front can be granted; patterns it builds at runtime cannot.** A rune that discovers a directory and globs inside it is asking with a string nobody could have written in advance. This is why the [kb plugin](kb:crunes-plugins-main/modules/kb.md) takes its roots from configuration rather than searching for them.

## Finding the grant

The denial names the exact token, and since the grant is an equality match that token *is* the grant to add — copy it verbatim. `crunes run` and `crunes repl` print the config entry to add it to.

`fs.read` and `fs.write` do not behave this way. Those are path capabilities, matched with glob semantics where `*` stops at `/`, so `fs.read:./src/**` covers every file beneath `src`. Only `fs.glob` compares patterns.
