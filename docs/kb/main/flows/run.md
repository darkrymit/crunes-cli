---
type: flow
title: crunes run
description: From argv to sections — prefix-only flag parsing, optional batch splitting, tiered key resolution, isolate setup and the two waves in which output reaches stdout.
tags: [flow, run, isolate]
resource: src/rune/commands/run.js
---

# `crunes run`

One or more rune keys are resolved, each rune executes in its own isolate, and sections reach stdout progressively rather than all at the end.

```mermaid
flowchart TD
    argv([crunes run argv]) --> parse_flags[parse flags from the prefix<br/>stop at first non-flag token]
    parse_flags --> batch{--batch given?}
    batch -->|yes| split_segments[split remainder on +]
    batch -->|no| one_segment[remainder is one segment]
    split_segments --> each_segment[for each segment]
    one_segment --> each_segment
    each_segment --> parse_segment[extract key, rune args, section filter]
    parse_segment --> resolve_key[resolve the key]
    resolve_key --> run_isolate[run in isolate]
    run_isolate --> more{more segments?}
    more -->|yes| each_segment
    more -->|no| done([done])
```

## Flag parsing stops early

`parseRunArgs` walks argv and halts at the first token that is not a known command flag. Everything from there belongs to the rune, **including tokens that look like flags**.

This is what gives a rune author their own argument space. A rune may declare `--format` without colliding with the command's `--format`, because the command stopped reading before it got there.

`-b` / `--batch` is opt-in for the same reason. Without it, `+` is an ordinary argument; with it, `+` separates independent invocations. Making batching the default would silently break any rune that uses `+` in its own arguments.

## Resolution tiers

Tried in order, first match wins:

| Key form | Path taken |
|---|---|
| `local:key` | project config only |
| `plugin:name` | the named plugin, directly |
| bare key with a `plugin` field in config | alias, re-dispatched to that plugin rune |
| bare key with no config entry | every enabled plugin, refusing if two claim it |

The refusal on ambiguity is the load-bearing part — see [rune](/modules/rune.md).

## Isolate setup

```mermaid
flowchart TD
    start([resolved rune entry]) --> effective_perms[compute effective permissions<br/>plugin declarations + project overrides + auto-grants]
    effective_perms --> create_utils[build utils bound to the permission checker]
    create_utils --> new_isolate[create isolate with a memory limit]
    new_isolate --> create_context[create context<br/>inject host require bridge<br/>inject plugin root if a plugin rune]
    create_context --> inject_utils[inject every utils namespace as references]
    inject_utils --> compile[compile the rune module]
    compile --> evaluate[evaluate under the eval timeout]
    evaluate --> args_export{args export?}
    args_export -->|yes| parse_schema[call the builder, parse args against the schema]
    args_export -->|no| raw_positionals[collect positionals as strings]
    parse_schema --> call_run[call run with parsed args]
    raw_positionals --> call_run
    call_run --> collect[collect sections]
    collect --> teardown([dispose isolate])
```

Permissions are computed **before** the isolate exists, and the checker is bound into the utils object as it is built. There is no moment at which a capability is reachable without its check, because the unchecked function is never placed on the bridge.

The isolate is disposed immediately after. Nothing is pooled or reused, so no state can leak between invocations — see [the isolate boundary](/patterns/sandbox-isolation.md).

## Output arrives in two waves

**During execution**, `onEvent` fires as the rune emits, so a long-running rune produces output while it works rather than at the end.

**After execution**, a flush emits anything the rune returned but never emitted progressively.

A rune therefore has two ways to produce a section and need not choose deliberately: emitting streams it, returning it flushes it, and returning something already emitted does not duplicate it.

The section filter (`key[-s name]`) applies to this output after the rune finishes, never inside the isolate.

## The JSONL format is also a wire protocol

`--format jsonl` is not only for humans piping output. It is what `rune.exec` parses when one rune calls another as a child process, so the same render path serves interactive streaming and inter-rune communication.

Child spawns receive `CRUNES_NO_TIMEOUT=1`, so a slow child does not consume the parent's evaluation budget and cascade into a timeout that names the wrong rune.
