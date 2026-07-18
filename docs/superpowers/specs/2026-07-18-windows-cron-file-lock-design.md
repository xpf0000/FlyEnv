# Windows Cron File Lock Design

## Goal

Fix Windows scheduled Cron jobs that stop running after an interrupted execution, without adding VBS/WSH launchers or allowing a long-running job to overlap with a later schedule.

## Confirmed Cause

The generated PowerShell wrapper currently treats a directory named `<jobId>.lock` as the execution lock. It removes that directory only on the normal completion path. If PowerShell, FlyEnv, or Windows exits before cleanup, the directory remains and every later run exits immediately when `New-Item` cannot recreate it. The resulting PowerShell window may briefly appear, but no command or run record is produced.

The PR's proposed 300-second stale-directory timeout is not safe. The directory timestamp is not refreshed while the command runs, so a valid job lasting more than five minutes can be launched a second time.

## Execution Design

Keep the existing Task Scheduler action:

```text
Task Scheduler -> powershell.exe -File <job>.ps1 -> cmd.exe /d /c <command>
```

Do not generate or execute `.vbs` files. `powershell.exe` may remain briefly visible on some Windows configurations; this is cosmetic and is accepted for this change. The child `cmd.exe` process continues to use `CreateNoWindow = true`.

Replace the directory lock with an exclusive `System.IO.FileStream` opened at `<jobId>.running.lock` using:

- `FileMode.OpenOrCreate`
- `FileAccess.ReadWrite`
- `FileShare.None`

The wrapper holds the stream for the complete command, result-recording, and temporary-file cleanup lifecycle. A second wrapper cannot open the same file and exits without starting the command. PowerShell releases the handle automatically after a crash, forced termination, or reboot, so the persistent lock file does not block the next run. There is no age timeout and therefore no five-minute overlap boundary.

The new filename intentionally differs from the legacy `<jobId>.lock` directory. Old directories are ignored and may remain as harmless artifacts; deleting them cannot safely distinguish an abandoned directory from one owned by an old wrapper that is still running.

## Existing-Job Migration

An application update does not currently recreate persisted Task Scheduler actions or their generated `.ps1` files. Therefore changing only the script generator would leave existing jobs on the broken wrapper indefinitely.

Add a version marker to newly generated wrappers. During Cron initialization on Windows, inspect every enabled local job and rewrite its wrapper in place when the file is missing or does not carry the current marker. The Task Scheduler action already points to that stable script path, so migration does not delete or recreate the scheduled task and does not require a new scheduler registration. Disabled jobs are migrated when they are enabled and installed again.

Migration failures are isolated per job and logged. They do not stop metadata synchronization or migration of other jobs.

## Encoding Decision

Keep the existing scheduled-command decoding policy for this fix: use the current Windows culture's OEM code page for `cmd.exe` stdout and stderr, then store the decoded text as UTF-8 in FlyEnv's run log.

Do not adopt the PR's unconditional UTF-8 decoder. It changes only the decoder and does not force `cmd.exe` or arbitrary child programs to emit UTF-8, so normal Chinese Windows CP936 output can become garbled. Commands that explicitly emit UTF-8 can still be decoded incorrectly by the current OEM policy; supporting both encodings requires a separate raw-byte capture and decoding contract with representative Windows tests.

## Error Handling

- An exclusive-lock conflict means another run is active; exit without launching a duplicate command.
- Any path after successful lock acquisition releases the stream in `finally`.
- Command, working-directory, output, and run-record behavior otherwise remains unchanged.
- A leftover `.running.lock` file is expected and is reusable; lock ownership is represented by the open handle, not file existence.
- Wrapper migration logs failures and continues with other jobs.

## Testing

Extend the focused Cron script contract to verify:

- the generated wrapper uses `FileStream` with `FileShare.None`;
- lock disposal is in `finally`;
- no directory-lock creation, age timeout, UTF-8 command decoder, or VBS launcher is introduced;
- the task action still invokes PowerShell directly;
- the current `/d /c` command arguments are asserted correctly.

Add a Windows-only behavior test that executes the generated wrapper and verifies:

- a normal job executes and records output;
- two concurrent invocations start the command only once;
- terminating the lock-owning PowerShell process does not block the next invocation;
- an active job retains exclusive ownership for its complete lifetime.

The generator contract also asserts that the wrapper contains no age or timeout based lock takeover. Together with the active-owner behavior test, this covers long-running jobs without adding a five-minute test delay.

Add migration tests for missing, legacy, current, enabled, and disabled wrapper cases. On non-Windows development hosts, Windows runtime tests skip explicitly while generator and migration-decision tests remain runnable.

## Out of Scope

- Eliminating every possible PowerShell window flash.
- Adding VBS/WSH or a native launcher executable.
- Automatically detecting arbitrary command-output encodings.
- Modifying Monaco Editor patches or tests.
- Changing Windows Task Scheduler schedules or multiple-instance settings.
