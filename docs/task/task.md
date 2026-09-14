# Task: Fix FlyEnv Windows Helper installation for cross-user UAC elevation

Repository:

https://github.com/xpf0000/FlyEnv

Related issue:

https://github.com/xpf0000/FlyEnv/issues/852

## Background

There is a confirmed Windows bug when FlyEnv is started by a normal/standard Windows user, but UAC elevation is completed using a different administrator account.

This is common on corporate/domain-managed Windows machines.

Example environment:

```text
FlyEnv desktop user:
MYCOMPANY\rabdallah

USERPROFILE:
C:\Users\rabdallah

LOCALAPPDATA:
C:\Users\rabdallah\AppData\Local
```

When FlyEnv requests administrator privileges, the user enters credentials for a separate administrator account:

```text
Elevated user:
MYCOMPANY\adminuser.adm

USERPROFILE:
C:\Users\adminuser.adm

LOCALAPPDATA:
C:\Users\adminuser.adm\AppData\Local
```

Windows elevation itself works correctly.

The following have already been tested successfully:

```text
Direct UAC elevation: OK
PowerShell from normal user's TEMP: OK
Cross-user TEMP read: OK
Cross-user TEMP write: OK
Cross-user TEMP delete: OK

stdout write: OK
stderr write: OK
status write: OK

ProgramData\FlyEnv write: OK

VBScript / ShellExecute runas: OK

Scheduled Task creation: OK
SYSTEM Scheduled Task execution: OK
```

AppLocker has no effective policies preventing execution.

Therefore, do NOT treat this primarily as a Windows security-policy failure.

---

# Confirmed failure

After FlyEnv tries to install the Windows helper, the generated Scheduled Task is:

```text
Task:
\FlyEnvHelperTask

Principal:
UserId    : adminuser.adm
LogonType : Interactive
RunLevel  : Highest
```

Its action is effectively:

```text
C:\Program Files\FlyEnv\resources\helper\flyenv-helper.exe

--key-path "C:\Users\adminuser.adm\AppData\Local\FlyEnv\flyenv-helper.key"

--expected-user-sid "<SID belonging to the elevated administrator context>"
```

However, the actual FlyEnv application is running as:

```text
MYCOMPANY\rabdallah
```

and FlyEnv expects the helper key here:

```text
C:\Users\rabdallah\AppData\Local\FlyEnv\flyenv-helper.key
```

FlyEnv consequently reports:

```text
Windows helper key missing:
C:\Users\rabdallah\AppData\Local\FlyEnv\flyenv-helper.key
```

This strongly indicates that the helper installation code incorrectly uses the **elevated administrator identity** as the FlyEnv target user.

---

# Core concepts

There are two different identities and they MUST NOT be confused.

## targetUser

The Windows user who actually launched FlyEnv.

Example:

```text
MYCOMPANY\rabdallah
```

All FlyEnv user-specific state belongs to this identity.

This includes, where applicable:

```text
FlyEnv user data directory
flyenv-helper.key
expected-user-sid
permissions granted to the FlyEnv user
helper authentication/authorization
```

## elevatedUser

The administrator account supplied only to satisfy UAC.

Example:

```text
MYCOMPANY\adminuser.adm
```

This account is only an elevation mechanism.

It MUST NOT silently become the owner/target identity of FlyEnv.

---

# First step: inspect the existing implementation

Do not start modifying code immediately.

First trace the complete Windows helper installation flow in the current repository.

Search for at least:

```text
AppHelper
FlyEnvHelperTask
flyenv-helper.key
expected-user-sid
flyenv-auto-start-now
ScheduledTask
Register-ScheduledTask
New-ScheduledTaskPrincipal
WindowsIdentity
GetCurrent
LOCALAPPDATA
USERPROFILE
USERNAME
whoami
Sudo
WindowsHelperFallback
WindowsHelperState
```

Likely relevant files may include files such as:

```text
src/main/core/AppHelper.ts
src/shared/Sudo.ts
src/shared/WindowsHelperFallback.ts
```

but do NOT assume these are the only files involved.

Find the actual current implementation.

Document internally:

```text
1. where target user SID is obtained
2. where key path is created
3. where ProgramData ACL is configured
4. where FlyEnvHelperTask is registered
5. how Task Principal is selected
6. how expected-user-sid is generated
7. how helper key is generated/read
8. how the helper authenticates FlyEnv
9. how existing helper/task state is validated
10. how WindowsHelperFallback depends on this infrastructure
```

Only after understanding the actual current implementation should you modify it.

---

# Root cause to verify

Look specifically for code executed AFTER elevation that derives the target user from values such as:

```powershell
$env:USERNAME
$env:USERPROFILE
$env:LOCALAPPDATA

whoami

[System.Security.Principal.WindowsIdentity]::GetCurrent()
```

or equivalent APIs.

When used inside the elevated process, these return:

```text
adminuser.adm
```

not:

```text
rabdallah
```

That is correct Windows behavior but incorrect for FlyEnv's target-user selection.

Verify exactly where this occurs.

---

# Required fix

## 1. Capture target identity BEFORE elevation

The original FlyEnv process must determine the target user before invoking UAC.

Obtain at least:

```text
targetUserSid
targetUserName
targetUserLocalAppData
targetHelperKeyPath
```

Prefer SID as the stable security identity.

Example:

```text
targetUserName:
MYCOMPANY\rabdallah

targetUserSid:
S-1-5-21-...

targetUserLocalAppData:
C:\Users\rabdallah\AppData\Local

targetHelperKeyPath:
C:\Users\rabdallah\AppData\Local\FlyEnv\flyenv-helper.key
```

Do not reconstruct these values after elevation.

Do not assume:

```text
elevated user == target user
```

---

# 2. Explicitly pass target identity into the elevated installer

The elevated installation process must receive the original target-user information explicitly.

Do not let the elevated script infer the target user from its own environment.

Pass values in a robust and correctly escaped form.

Be careful about:

```text
spaces
Unicode usernames
domain usernames
quotes
PowerShell escaping
special characters
```

If the existing installation mechanism uses generated PowerShell, make the data transfer unambiguous.

Avoid fragile string interpolation where practical.

---

# 3. Helper key path must belong to targetUser

The helper must use:

```text
<targetUserLocalAppData>\FlyEnv\flyenv-helper.key
```

NOT:

```text
<elevatedUserLocalAppData>\FlyEnv\flyenv-helper.key
```

For the reported environment, the correct path is:

```text
C:\Users\rabdallah\AppData\Local\FlyEnv\flyenv-helper.key
```

The following must all agree on exactly the same path:

```text
FlyEnv main process
helper installer
FlyEnvHelperTask arguments
flyenv-helper.exe
AppHelperCheck / helper-state validation
fallback logic
```

There must be one canonical computation of this path where possible.

---

# 4. expected-user-sid must represent targetUser

This is especially important for security.

The helper argument:

```text
--expected-user-sid
```

must refer to the user running FlyEnv:

```text
targetUserSid
```

It must NOT refer to the administrator account that approved UAC.

Do not weaken this check.

Do not remove SID validation just to make the issue disappear.

---

# 5. Review Scheduled Task principal design

The current failing environment produced:

```text
UserId    : adminuser.adm
LogonType : Interactive
RunLevel  : Highest
```

This is unsuitable for cross-user UAC elevation.

The administrator account is only being used as an elevation credential and may not have an interactive desktop session.

Evaluate the current helper security design and change the task principal appropriately.

Preferred architecture, if compatible with the current helper authentication model:

```text
FlyEnvHelperTask

UserId:
NT AUTHORITY\SYSTEM

LogonType:
ServiceAccount

RunLevel:
Highest
```

The diagnostics have already confirmed that a SYSTEM Scheduled Task can successfully be:

```text
created
started
executed
removed
```

on the affected machine.

However:

DO NOT blindly change the task to SYSTEM without reviewing the helper authentication/security model.

Before doing this, verify:

```text
named pipe permissions
key-file permissions
expected-user-sid enforcement
helper request validation
command authorization
helper lifecycle
```

The final architecture must remain secure.

The objective is:

```text
FlyEnv.exe
runs as targetUser

        ↓ authenticated IPC

flyenv-helper.exe
runs with required privilege

        ↓

privileged operation
```

The privilege identity of the helper must NOT redefine the FlyEnv target identity.

---

# 6. ProgramData ACL must use target user identity

The failing installation currently produces permissions associated with the elevated administrator account.

Where FlyEnv intentionally grants access to the application user, grant it to:

```text
targetUserSid
```

not:

```text
elevatedUser
```

Prefer SID-based ACL operations rather than localized account/group names.

Avoid depending on strings such as:

```text
Administrators
Users
```

when a well-known SID can be used.

Do not grant:

```text
Everyone FullControl
Users FullControl
```

Do not weaken filesystem security as a workaround.

---

# 7. Existing broken installations must be automatically repaired

This is required.

Users affected by Issue #852 may already have a broken task such as:

```text
FlyEnvHelperTask
principal = adminuser.adm

--key-path =
C:\Users\adminuser.adm\AppData\Local\FlyEnv\flyenv-helper.key

--expected-user-sid =
adminuser.adm SID
```

Simply fixing new installations is insufficient.

On startup/helper validation, detect stale or mismatched helper installations.

Validate at least:

```text
task exists
task principal
task action executable
key path
expected-user-sid
helper executable path/version where applicable
```

Compare them to the expected state for the CURRENT FlyEnv target user.

If the installation belongs to another user or is otherwise invalid:

```text
mark helper installation invalid

remove/recreate only FlyEnv-owned helper state

reinstall helper correctly
```

Do not delete unrelated Scheduled Tasks.

Do not delete arbitrary user files.

Limit repair operations to clearly identified FlyEnv helper resources.

---

# 8. Consider old key files and orphaned admin-profile state

The broken installation may have created artifacts associated with the elevation account.

For example:

```text
C:\Users\<admin-user>\AppData\Local\FlyEnv\flyenv-helper.key
```

Do NOT blindly delete files from another user's profile.

Instead:

* stop relying on them;
* repair the current target user's installation;
* only clean old artifacts if ownership and provenance can be proven safely.

Security and data safety take priority over aggressive cleanup.

---

# 9. Preserve same-user UAC behavior

The common Windows case must continue to work:

```text
FlyEnv user:
Alice

UAC elevated user:
Alice
```

Do not fix cross-user elevation by breaking normal administrator-user elevation.

Both must work:

### Scenario A

```text
targetUser == elevatedUser
```

### Scenario B

```text
targetUser != elevatedUser
```

Scenario B is the regression case from Issue #852.

---

# 10. Preserve WindowsHelperFallback

Inspect how:

```text
WindowsHelperFallback
```

uses the helper, Sudo layer, key path, target SID, or privileged PowerShell operations.

The fix must not create a second identity bug in fallback mode.

Use the same target-user identity model consistently across:

```text
normal helper
helper recovery
fallback
helper state detection
shell-hook installation
privileged file writes
```

---

# 11. Do NOT unnecessarily change Sudo TEMP communication

Diagnostics have already demonstrated that the affected environment supports:

```text
cross-user TEMP read
cross-user TEMP write
cross-user TEMP delete

stdout write
stderr write
status write
```

The elevated administrator successfully wrote all communication files back into the normal user's TEMP directory.

Therefore:

Do not redesign Sudo TEMP IPC unless source inspection reveals a separate concrete bug.

Avoid expanding the scope of this fix unnecessarily.

---

# 12. Improve diagnostic logging

Improve Windows helper installation logs sufficiently to diagnose this class of issue in the future.

Log non-secret metadata such as:

```text
targetUserName
targetUserSid

targetUserLocalAppData
targetHelperKeyPath

elevatedUserName

taskName
taskPrincipal
taskLogonType

helperExecutable
expectedUserSid

installation stage
repair reason
```

Never log:

```text
helper key contents
passwords
credentials
tokens
private secrets
```

When helper initialization fails, preserve the actual underlying Windows/PowerShell error where possible.

Do not reduce every elevation error to only:

```text
User did not grant permission
```

if more specific diagnostic information is available.

---

# 13. Error handling

Make helper installation failure actionable.

Differentiate where practical between:

```text
UAC cancelled
elevation process failed
PowerShell failed
Scheduled Task registration failed
helper executable failed
helper key missing
helper key inaccessible
SID mismatch
stale helper installation
task principal mismatch
```

Internal logs should contain sufficient detail even if UI error messages remain concise.

---

# 14. Tests

Add automated tests where the architecture allows it.

At minimum, isolate and test logic responsible for:

```text
target user identity
key-path selection
expected SID selection
task configuration
existing-task validation
repair decision
```

The key regression test is:

```text
target user:
MYCOMPANY\rabdallah

elevated user:
MYCOMPANY\adminuser.adm
```

Expected:

```text
helper key path -> rabdallah

expected-user-sid -> rabdallah SID

ACL target -> rabdallah SID

helper authentication -> rabdallah

NOT adminuser.adm
```

Where Windows-specific integration tests cannot run automatically, structure the code so the identity/configuration logic can still be unit tested separately.

---

# 15. Manual regression scenarios

Document and, where possible, test these cases.

## Case 1 — Administrator launches FlyEnv

```text
FlyEnv user = administrator user
UAC user = same administrator
```

Expected:

```text
helper installs
helper starts
key is found
privileged operations work
```

## Case 2 — Standard user + different local admin

```text
FlyEnv user = standard local user
UAC credentials = different local admin
```

Expected:

```text
helper belongs logically to FlyEnv user
key path uses standard user's LocalAppData
expected SID is standard user's SID
helper works
```

## Case 3 — Domain user + domain/admin credentials

This represents Issue #852.

```text
FlyEnv:
DOMAIN\user

UAC:
DOMAIN\adminuser
```

Expected:

same as Case 2.

## Case 4 — Existing broken FlyEnvHelperTask

Start with a task configured for the wrong user.

Expected:

```text
FlyEnv detects mismatch
repairs/reinstalls helper
new state matches current target user
```

## Case 5 — Paths containing spaces

Example:

```text
C:\Users\John Smith\AppData\Local\FlyEnv
```

Expected:

all PowerShell/task arguments remain valid.

## Case 6 — Unicode Windows username/path where supported

Ensure no unnecessary ASCII assumptions are introduced.

---

# 16. Security requirements

This helper is privileged infrastructure.

Do NOT fix the problem by weakening authorization.

Forbidden shortcuts include:

```text
removing expected-user-sid validation

using Everyone FullControl

making helper key world-readable

accepting requests from arbitrary Windows users

disabling ACL checks

turning off UAC/security configuration

using a globally shared static helper secret
```

The intended security boundary must remain at least as strong as the current implementation.

If changing the task to SYSTEM expands privilege, ensure the helper's authentication and IPC authorization remain tightly scoped to the target FlyEnv user.

---

# 17. Platform scope

This bug is Windows-specific.

Do not modify macOS/Linux behavior unless required by shared abstractions.

Avoid unrelated refactors.

Keep the patch focused.

---

# 18. Verify repository conventions

Before finalizing:

Inspect:

```text
package.json
existing tests
lint scripts
typecheck scripts
build scripts
code formatting conventions
logging conventions
error classes
Windows helper conventions
```

Run the relevant existing repository checks.

Do not invent command names.

Use the scripts actually defined by the repository.

---

# 19. Acceptance criteria

The task is complete only when all of the following are true.

### Identity

```text
target user is captured before elevation
elevated identity is never mistaken for target identity
```

### Key

For a standard user using separate administrator credentials:

```text
flyenv-helper.key belongs to / is located for targetUser
FlyEnv and helper agree on the exact key path
```

### SID

```text
--expected-user-sid == targetUserSid
```

not the UAC administrator SID.

### Scheduled Task

The task can run the privileged helper independently of the administrator account used to approve installation.

It must not incorrectly depend on:

```text
adminuser.adm interactive login
```

### ACL

Permissions intended for the FlyEnv user are applied to:

```text
targetUserSid
```

not the temporary UAC administrator.

### Repair

An existing broken helper installation created by an older FlyEnv version is detected and automatically repaired.

### Security

No weakening of helper authentication or filesystem permissions.

### Regression

Normal same-user UAC installations still work.

---

# 20. Final response required from Codex

After implementing the fix, report:

## Root cause

Explain exactly which existing code used the elevated identity incorrectly.

Include actual file names/functions.

## Changes made

List each modified file and what changed.

## Scheduled Task design

Explain the final task principal and why it was chosen.

If SYSTEM was used, explain why it is safe with the existing/new helper authentication model.

## Migration

Explain how existing broken FlyEnvHelperTask installations are detected and repaired.

## Security

Explain how:

```text
key security
SID validation
IPC authorization
ACLs
```

remain protected.

## Tests

List:

```text
tests added
commands run
results
```

## Manual verification

Provide exact manual verification steps for reproducing Issue #852 with:

```text
normal user + separate administrator credentials
```

## Remaining risks

List any known limitations honestly.

---

# Important

Do not merely patch the observed username:

```text
adminuser.adm
```

This must be a general architectural fix for:

```text
targetUser != elevatedUser
```

Do not hardcode:

```text
rabdallah
adminuser.adm
MYCOMPANY
```

Those values only describe the reproduction environment.

Investigate the current implementation first, make the smallest robust architectural correction, preserve security, add repair logic, and verify the full Windows helper lifecycle.
