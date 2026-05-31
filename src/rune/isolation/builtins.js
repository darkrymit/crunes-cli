// Known dangerous built-ins
// Purpose: actionable error messages, not primary security. Zero-trust step 5 catches everything else.
export const DENY_BUILTINS = new Map([
  ['node:fs', "Blocked — use utils.fs instead"],
  ['node:fs/promises', "Blocked — use utils.fs instead"],
  ['fs', "Blocked — use utils.fs instead"],
  ['node:child_process', "Blocked — use utils.shell instead"],
  ['child_process', "Blocked — use utils.shell instead"],
  ['node:net', "Blocked — direct TCP not permitted"],
  ['net', "Blocked — direct TCP not permitted"],
  ['node:http', "Blocked — use utils.http (coming soon)"],
  ['http', "Blocked — use utils.http (coming soon)"],
  ['node:https', "Blocked — use utils.http (coming soon)"],
  ['https', "Blocked — use utils.http (coming soon)"],
  ['node:os', "Blocked — OS access not permitted"],
  ['os', "Blocked — OS access not permitted"],
  ['node:vm', "Blocked — VM access not permitted"],
  ['vm', "Blocked — VM access not permitted"],
  ['node:worker_threads', "Blocked — not permitted in plugin runes"],
  ['worker_threads', "Blocked — not permitted in plugin runes"],
  ['node:inspector', "Blocked — not permitted"],
  ['inspector', "Blocked — not permitted"],
])
