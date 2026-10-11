---
type: module
title: job
description: Background process tracking as one file per job with no central index, lazily garbage-collected at read time, plus the poll-based stdin log that lets a REPL job survive a parent restart.
tags: [module, job, process]
resource: src/job/
---

# job

When a rune spawns a process that outlives the invocation, this module records it. Each job is a small file in the store. There is no index database.

## One file per job

A single `jobs.json` would need read-modify-write on every spawn, and concurrent rune processes spawning simultaneously would contend and could corrupt it. One file per job removes the coordination entirely: each writer touches only its own file.

The cost is that listing means scanning a directory rather than reading one file — cheap, because job records are tiny.

**Garbage collection is lazy and happens at read time.** Listing walks the directory, checks which pids are alive, and removes records for dead ones. Dead jobs therefore accumulate between listings and vanish at the next one. The alternative — cleaning up when a process exits — needs a daemon or a reliable exit hook, and a SIGKILLed process has neither.

Jobs are filed under a [project identity](/modules/project.md) rather than a path, which keeps directory names short and keeps project locations out of filenames. A job spawned outside any project has no project association, appears in global listings with a placeholder, and is valid.

## Identification by prefix

Job ids are long. Lookup tries an exact match, then a prefix match, and refuses when a prefix matches zero or several. Eight characters is normally unambiguous.

## Logs

**Rune jobs** pass open file descriptors for stdout and stderr straight to the child, which writes to the files with nothing in between.

**Shell jobs** use `pipe` stdio and pump the child's output through Node `WriteStream`s into the log files. This is required rather than preferred: shell jobs run with `detached: false` on Windows, where fd inheritance is not reliable.

Either way, reading a log loads the whole file into memory.

## REPL jobs tail a stdin log

A job started with `{ repl: true }` gets a `stdin.log` beside the output logs. The parent appends lines — JSONL input events for rune jobs, raw text for shell jobs — and the child tails the file with a polling reader, forwarding each line to its own stdin. An `__CRUNES_STDIN_EOF__` sentinel tells the reader to end the child's stdin.

The design survives a parent restart: the child keeps tailing for as long as it lives, and a new parent resumes writing to the same path. A socket or a pipe would die with the parent.

## Gotchas

**A SIGKILLed rune leaves a stale record.** It had no chance to clean up, and nothing removes the record until someone lists. Repeated testing without listing accumulates dead files; one list clears them.

**Pid reuse produces false positives.** The only stored liveness evidence is the pid, so a recycled pid makes a long-dead job look alive. Rare, but real on a busy machine, and there is no second signal to disambiguate.

**Logs grow without bound.** Nothing truncates, rotates or caps stdout, stderr or `stdin.log`. A chatty long-running job consumes disk until its record is deleted.

**`shell.job.kill` kills the process tree.** The stored pid is the shell, and jobs resolve their shell the same way `shell.exec` does — bash on every platform by default, not `cmd.exe` on Windows, unless the job passes `shell: 'cmd'`. On Windows the kill uses `taskkill /F /T`; on Unix shell jobs are `detached: true` so the shell leads a process group and the signal goes to `-pid`. Killing only the shell on Unix would orphan the children of a compound command.

**`shell.job.write` is not covered by `shell.job.read`.** They are separate tokens, so driving a job's stdin needs the write grant explicitly.

**The Windows tail timer can outlive a SIGKILL.** The reader's `stop()` runs from the child's `exit` event, which SIGKILL does not always deliver on Windows, so the polling `setTimeout` may keep running until the process ends. Benign, but it holds the child reference until collection.
