// Console shim for the isolate. $__log and $__err are ivm.Reference globals
// set by the host before this module is evaluated.
globalThis.console = {
  log:   (...a) => $__log.applyIgnored(undefined, a.map(String)),
  warn:  (...a) => $__warn.applyIgnored(undefined, a.map(String)),
  error: (...a) => $__err.applyIgnored(undefined, a.map(String)),
}

globalThis.logger = {
  info:  (msg, meta) => $__utils_logger_emit.applySync(undefined, ['info',  msg, meta ?? null], { arguments: { copy: true } }),
  warn:  (msg, meta) => $__utils_logger_emit.applySync(undefined, ['warn',  msg, meta ?? null], { arguments: { copy: true } }),
  error: (msg, meta) => $__utils_logger_emit.applySync(undefined, ['error', msg, meta ?? null], { arguments: { copy: true } }),
  debug: (msg, meta) => $__utils_logger_emit.applySync(undefined, ['debug', msg, meta ?? null], { arguments: { copy: true } }),
}
