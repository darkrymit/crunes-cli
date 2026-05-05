// Safe Node built-ins always available inside the isolate — pure computation, no I/O.
export const ALLOW_BUILTINS = new Set([
  'node:path',
  'node:url',
  'node:util',
  'node:buffer',
  'node:crypto',
  'node:events',
  'node:string_decoder',
  'node:querystring',
  'node:assert',
  'node:punycode',
  // bare names (without node: prefix) — normalised before lookup
  'path',
  'url',
  'util',
  'buffer',
  'crypto',
  'events',
  'string_decoder',
  'querystring',
  'assert',
  'punycode',
])

// Known dangerous built-ins — reached only at step 4 (after steps 1-3 did not match).
// Purpose: actionable error messages, not primary security. Zero-trust step 5 catches everything else.
export const DENY_BUILTINS = new Map([
  ['node:fs',             "Blocked — use utils.fs instead"],
  ['node:fs/promises',    "Blocked — use utils.fs instead"],
  ['fs',                  "Blocked — use utils.fs instead"],
  ['node:child_process',  "Blocked — use utils.shell instead"],
  ['child_process',       "Blocked — use utils.shell instead"],
  ['node:net',            "Blocked — direct TCP not permitted"],
  ['net',                 "Blocked — direct TCP not permitted"],
  ['node:http',           "Blocked — use utils.http (coming soon)"],
  ['http',                "Blocked — use utils.http (coming soon)"],
  ['node:https',          "Blocked — use utils.http (coming soon)"],
  ['https',               "Blocked — use utils.http (coming soon)"],
  ['node:os',             "Blocked — OS access not permitted"],
  ['os',                  "Blocked — OS access not permitted"],
  ['node:vm',             "Blocked — VM access not permitted"],
  ['vm',                  "Blocked — VM access not permitted"],
  ['node:worker_threads', "Blocked — not permitted in plugin runes"],
  ['worker_threads',      "Blocked — not permitted in plugin runes"],
  ['node:inspector',      "Blocked — not permitted"],
  ['inspector',           "Blocked — not permitted"],
])
