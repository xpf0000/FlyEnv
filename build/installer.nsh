RequestExecutionLevel admin

!macro customInit
    nsExec::Exec 'taskkill /F /IM flyenv-helper.exe'
!macroend

!macro customInstall
    ReadEnvStr $R0 "WINDIR"
    StrCpy $R1 "$R0\System32\WindowsPowerShell\v1.0\powershell.exe"

    IfFileExists $R1 0 +2
    StrCpy $R1 "powershell.exe"

    nsExec::Exec '$R1 -ExecutionPolicy Bypass -InputFormat None -File "$INSTDIR\resources\helper\flyenv-helper-init.ps1" -instDir "$INSTDIR"'
!macroend

!macro customUnInit
    ReadEnvStr $R0 "WINDIR"
    StrCpy $R1 "$R0\System32\WindowsPowerShell\v1.0\powershell.exe"

    IfFileExists $R1 0 +2
    StrCpy $R1 "powershell.exe"

    nsExec::Exec '$R1 -ExecutionPolicy Bypass -Command "schtasks /Delete /TN flyenv-helper /F"'
    nsExec::Exec 'taskkill /F /IM flyenv-helper.exe'
!macroend
