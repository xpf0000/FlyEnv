#!/bin/bash
if [ -f "$HOME/.bashrc" ]; then
  source "$HOME/.bashrc"
fi
password=$1
echo "$password" | sudo -S dnf install 'dnf-command(copr)'
echo "$password" | sudo -S dnf copr enable @caddy/caddy
echo "$password" | sudo -S dnf update
