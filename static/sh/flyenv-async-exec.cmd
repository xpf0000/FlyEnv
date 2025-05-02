@echo off
chcp 65001>nul
#ENV#
cd /d "#CWD#"
#BIN# #ARGS# > "#OUTLOG#" 2>"#ERRLOG#"
