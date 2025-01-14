#!/bin/zsh
if [ -f "$HOME/.bash_profile" ]; then
  source "$HOME/.bash_profile"
fi
if [ -f "$HOME/.zshrc" ]; then
  source "$HOME/.zshrc"
fi
echo "$PATH"
