#!/bin/zsh
source ~/.bash_profile
source ~/.zshrc
arch=$1
action=$2
name=$3
echo "$arch brew $action --verbose $name"
arch $arch brew $action --verbose $name
