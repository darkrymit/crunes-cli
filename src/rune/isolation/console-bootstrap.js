// Console shim for the isolate. $__utils_console_emit is an ivm.Reference global
// set by the host before this module is evaluated.
globalThis.console = {
  log:   (...a) => $__utils_console_emit.applyIgnored(undefined, ['log',   ...a.map(String)]),
  warn:  (...a) => $__utils_console_emit.applyIgnored(undefined, ['warn',  ...a.map(String)]),
  error: (...a) => $__utils_console_emit.applyIgnored(undefined, ['error', ...a.map(String)]),
}

globalThis.logger = {
  info:  (msg, meta) => $__utils_logger_emit.applySync(undefined, ['info',  msg, meta ?? null], { arguments: { copy: true } }),
  warn:  (msg, meta) => $__utils_logger_emit.applySync(undefined, ['warn',  msg, meta ?? null], { arguments: { copy: true } }),
  error: (msg, meta) => $__utils_logger_emit.applySync(undefined, ['error', msg, meta ?? null], { arguments: { copy: true } }),
  debug: (msg, meta) => $__utils_logger_emit.applySync(undefined, ['debug', msg, meta ?? null], { arguments: { copy: true } }),
}
