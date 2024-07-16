#!/usr/bin/bash
if [ -f "~/.bashrc" ]; then
  source ~/.bashrc
fi
if [ -f "~/.zshrc" ]; then
  source ~/.zshrc
fi
arch=$1
action=$2
name=$3
echo "brew $action --verbose $name"
brew $action --verbose $name
