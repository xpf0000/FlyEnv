#!/bin/zsh

#ENV#

cd "#CWD#"
nohup "#BIN#" #ARGS# > "#OUTLOG#" 2>"#ERRLOG#" &
echo "##FlyEnv-Process-ID$!FlyEnv-Process-ID##"
