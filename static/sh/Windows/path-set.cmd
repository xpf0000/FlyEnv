@echo off
chcp 65001>nul
setlocal
set "NEW_PATH=##NEW_PATH##"
setx /M PATH "%NEW_PATH%"
##OTHER##
endlocal
