#!/bin/bash
if [ -f "~/.bashrc" ]; then
  source ~/.bashrc
fi
password=$1
echo "$password" | sudo -S dnf install 'dnf-command(copr)'
echo "$password" | sudo -S dnf copr enable @caddy/caddy
echo "$password" | sudo -S dnf update
