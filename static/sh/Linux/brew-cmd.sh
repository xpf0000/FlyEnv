#!/bin/bash
if [ -f "$HOME/.bashrc" ]; then
  source "$HOME/.bashrc"
fi
arch=$1
action=$2
name=$3
echo "$arch brew $action --verbose $name"
arch $arch brew $action --verbose $name
