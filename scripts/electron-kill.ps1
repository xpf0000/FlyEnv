Get-CimInstance Win32_Process -Filter "Name like 'electron.exe'" | Select-Object CommandLine,ProcessId,ParentProcessId | ConvertTo-Json
