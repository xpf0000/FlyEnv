@echo off
chcp 65001>nul
#ENV#
cd /d "#CWD#"
start /B #BIN# #ARGS# > "#OUTLOG#" 2>"#ERRLOG#"
