@echo off
chcp 65001>nul
set NEW_PATHEXT=##NEW_PATHEXT##
setx /M PATHEXT "%NEW_PATHEXT%"
