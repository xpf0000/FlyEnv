#!/bin/zsh
if [ -f "$HOME/.bash_profile" ]; then
  source "$HOME/.bash_profile"
fi
if [ -f "$HOME/.zshrc" ]; then
  source "$HOME/.zshrc"
fi
arch=$1
action=$2
name=$3
echo "$arch brew $action --verbose $name"
arch $arch brew $action --verbose $name
