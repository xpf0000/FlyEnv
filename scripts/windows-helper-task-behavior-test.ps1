$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../static/sh/Windows/flyenv-auto-start-now.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
# Import only function definitions; never execute installer operations.
foreach ($node in $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
  . ([scriptblock]::Create($node.Extent.Text))
}
$target = New-Object Security.Principal.SecurityIdentifier('S-1-5-21-100-200-300-400')
$instanceId = 'abf09273e32cc15f69da240b7f8f588f'
if ((Get-HelperInstanceId -Sid $target.Value) -ne $instanceId) { throw 'PowerShell SID instance ID does not match TypeScript/Go' }
$exePath = "C:\ProgramData\FlyEnv\Helper\users\$instanceId\bin\flyenv-helper.exe"
$arguments = "--instance-id `"$instanceId`" --expected-user-sid `"S-1-5-21-100-200-300-400`""
$action = [pscustomobject]@{ Path = $exePath; Arguments = $arguments }
$actions = [pscustomobject]@{ Count = 1; Action = $action }
$actions | Add-Member ScriptMethod Item { param($index) return $this.Action }
$triggers = [pscustomobject]@{ Count = 1; Trigger = [pscustomobject]@{ UserId = $target.Value } }
$triggers | Add-Member ScriptMethod Item { param($index) return $this.Trigger }
$principal = [pscustomobject]@{ UserId = 'S-1-5-18'; LogonType = 5; RunLevel = 1 }
$task = [pscustomobject]@{ Definition = [pscustomobject]@{ Principal = $principal; Actions = $actions; Triggers = $triggers }; Stopped = $false }
$task | Add-Member ScriptMethod Stop { param($flags) $this.Stopped = $true }
Assert-RegisteredTaskConfiguration -Task $task -ExePath $exePath -AppUserSid $target -ExpectedArguments $arguments
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$triggers.Trigger.UserId = $currentIdentity.Name
Assert-RegisteredTaskConfiguration -Task $task -ExePath $exePath -AppUserSid $currentIdentity.User -ExpectedArguments $arguments
$triggers.Trigger.UserId = $target.Value
foreach ($change in @(
  @{ Object=$principal; Field='UserId'; Value='S-1-5-21-100-200-300-500' },
  @{ Object=$principal; Field='LogonType'; Value=3 },
  @{ Object=$action; Field='Path'; Value='C:\Other\flyenv-helper.exe' },
  @{ Object=$action; Field='Arguments'; Value='--key-path "admin-profile"' },
  @{ Object=$triggers.Trigger; Field='UserId'; Value='S-1-5-21-100-200-300-500' }
)) {
  $old = $change.Object.($change.Field)
  $change.Object.($change.Field) = $change.Value
  $rejected = $false
  try { Assert-RegisteredTaskConfiguration -Task $task -ExePath $exePath -AppUserSid $target -ExpectedArguments $arguments } catch { $rejected = $_.Exception.Message -like '*helper_task_invalid*' }
  $change.Object.($change.Field) = $old
  if (-not $rejected) { throw "Invalid task accepted: $($change.Field)" }
}
$folder = [pscustomobject]@{ Task=$task }
$folder | Add-Member ScriptMethod GetTask { param($name) return $this.Task }
$found = Get-TaskIfExists -TaskFolder $folder -TaskName $instanceId
if ($found -ne $task) { throw 'Current SID task lookup failed' }
Write-Output 'windows-helper-task-behavior-test: ok'
