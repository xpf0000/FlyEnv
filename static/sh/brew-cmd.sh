#!/bin/bash
if [ -f "~/.bashrc" ]; then
  source ~/.bashrc
fi
arch=$1
action=$2
name=$3
echo "brew $action --verbose $name"
brew $action --verbose $name
