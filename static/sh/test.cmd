@echo off
chcp 65001>nul
set NEW_PATH="%%FNM_HOME%%"
setx /M AAABBB "%NEW_PATH%"
