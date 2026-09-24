---
type: gotcha
title: Watching a Windows short path aborts the process
description: libuv compares an event filename against the directory string it was given and fails a native assertion when they disagree, so watching an 8.3 short path kills the process outright rather than throwing.
tags: [windows, fs, watch, libuv]
resource: src/rune/api/fs.js
---

# Watching a Windows short path aborts the process

On Windows, `os.tmpdir()` returns an 8.3 short path whenever the user name is long enough to need one — `C:\Users\RUNNER~1\AppData\Local\Temp`, `C:\Users\DARKRY~1\...`. The long form is what the filesystem reports in events.

Handing the short form to a watcher makes libuv compare the long filename it receives against the short directory string it was given, disagree, and fail this assertion:

```
Assertion failed: !_wcsnicmp(filename, dir, dirlen), file src\win\fs-event.c, line 72
```

**This is a native abort, not an exception.** No rune can catch it, no `try`/`catch` in the host sees it, and the process dies where it stands. Under a test runner it shows up as a worker that vanished, with the surviving output reporting *fewer tests than expected* rather than a failure — the crash is in a different frame from the report.

`fs.watch` resolves its base to the long form before handing anything to the watcher, which is why this no longer bites. The resolution has to cover the relative-path computation too: watching the long form while computing paths against the short one produces event paths climbing out of the project with `../..`.

## Where else it can appear

Any path arriving from `os.tmpdir()`, from a `%TEMP%` expansion, or from a symlink. It is not a property of watching as such — it is a property of a path string that is not the one the OS will report back. A short path used for reads and writes behaves normally, which is what makes the watch case surprising.

## It does not reproduce everywhere

Whether a machine even has 8.3 names generated is a filesystem setting, and whether a given directory has one depends on how it was created. A developer whose temp path happens to be short-form-free will never see this, and CI on a runner whose user name is `runneradmin` will see it every time.
