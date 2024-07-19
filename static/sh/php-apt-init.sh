#!/usr/bin/bash
if [ -f "~/.bashrc" ]; then
  source ~/.bashrc
fi
if [ -f "~/.zshrc" ]; then
  source ~/.zshrc
fi
password=$1
echo "$password" | sudo -S apt -y install software-properties-common
echo "$password" | sudo -S add-apt-repository -y ppa:ondrej/php
echo "$password" | sudo -S apt update