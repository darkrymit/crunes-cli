---
type: pattern
title: Feature-first module layout
description: Code under src/ is organised by feature domain rather than by infrastructure layer, so each feature owns its commands and internals and no shared infrastructure tier can form.
tags: [architecture, layout]
resource: src/
---

# Feature-first module layout

Each directory under `src/` is a feature domain that owns everything it needs: its CLI commands, its domain logic, and its internals. `rune/` holds `api/`, `isolation/`, `permissions/` and `commands/` — those are not top-level concerns that happen to be used by runes, they are parts of the rune feature.

The rule: **infrastructure lives inside the feature that owns it, never beside it.**

## Why

A top-level `infrastructure/` or `lib/` tier is where coupling cycles come from. Once several features import a shared module, that module accumulates knowledge of all of them, and answering *which feature is responsible for this* stops having an answer. Co-location makes the boundary visible — if `plugin/` needs something from `rune/`, that is an import between two named features, and it is obvious when there are too many.

It also makes deletion possible. Removing a feature means removing a directory, not auditing a shared tier for orphans.

## The one exception, and why it is not one

`shared/` exists and is imported by nearly everything: rendering, output, and the two glob matchers. It is not the tier this pattern forbids, because **it has no domain knowledge.** It does not know what a rune, a plugin or a project is. It knows how to draw a tree, how to write a line respecting colour mode, and how to match a string against a pattern.

That is what keeps it from becoming a coupling hub: a module with no domain knowledge cannot accumulate any, so nothing needs to avoid importing it and no cycle can form through it. The test for anything proposed for `shared/` is whether it can be described without naming a domain concept. If it cannot, it belongs in the feature.

`core/` sits in the same position for a narrower reason. It holds config loading and the circular-call error — the minimum that `rune/`, `plugin/`, `template/` and `docs/` all need in order not to import each other. It is deliberately close to empty, and content that arrives there wanting domain logic belongs in a feature instead.

## What it costs

**A feature's internals are reachable.** Nothing enforces that `plugin/` imports only the top of `rune/` rather than reaching into `rune/permissions/`. The boundary is a convention held up by review.

**Some code has no obvious home.** A capability genuinely shared by two features and carrying domain knowledge fits neither `shared/` nor one feature, and the honest resolution is to pick the feature that owns the concept and let the other import it — not to create a tier for the second case.
