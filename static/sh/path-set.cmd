@echo off
chcp 65001>nul
set NEW_PATH=##NEW_PATH##
setx /M PATH "%NEW_PATH%"
##OTHER##
