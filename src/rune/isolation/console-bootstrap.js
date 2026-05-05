// Console shim for the isolate. $__log and $__err are ivm.Reference globals
// set by the host before this module is evaluated.
globalThis.console = {
  log:   (...a) => $__log.applyIgnored(undefined, a.map(String)),
  error: (...a) => $__err.applyIgnored(undefined, a.map(String)),
  warn:  (...a) => $__err.applyIgnored(undefined, a.map(String)),
}
