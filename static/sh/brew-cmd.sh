#!/bin/bash
if [ -f "$HOME/.bashrc" ]; then
  source "$HOME/.bashrc"
fi
arch=$1
action=$2
name=$3
echo "brew $action --verbose $name"
brew $action --verbose $name
