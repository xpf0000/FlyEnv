@echo off
for /f "skip=2 tokens=2,*" %%A in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do (
  @REM setx /M PATH "%%B;%%FNM_HOME%%"
  set p=%%B
)
echo %p%