@echo off
set FNM_PATH=##FNM_PATH##
set FNM_HOME=%FNM_PATH%
set FNM_SYMLINK=##FNM_SYMLINK##
setx /M FNM_HOME "%FNM_HOME%"
setx /M FNM_SYMLINK "%FNM_SYMLINK%"

echo PATH=%PATH% > %FNM_HOME%\PATH.txt

set "cmdText=fnm env --use-on-cd ^| Out-String ^| Invoke-Expression"

setlocal
findstr /C:"fnm env --use-on-cd | Out-String | Invoke-Expression" "##PROFILE##" >nul
if errorlevel 1 (
    echo %cmdText% >> "##PROFILE##"
)
endlocal

setlocal
findstr /C:"fnm env --use-on-cd | Out-String | Invoke-Expression" "##PROFILE_ROOT##" >nul
if errorlevel 1 (
    echo %cmdText% >> "##PROFILE_ROOT##"
)
endlocal

for /f "skip=2 tokens=2,*" %%A in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do (
  setx /M PATH "%%B;%%FNM_HOME%%;%%FNM_SYMLINK%%"
)

if exist "%SYSTEMDRIVE%\Program Files (x86)\" (
set SYS_ARCH=64
) else (
set SYS_ARCH=32
)
(echo root: %FNM_HOME% && echo arch: %SYS_ARCH% && echo proxy: none) > "%FNM_HOME%\settings.txt"
@echo on
