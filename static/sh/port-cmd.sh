#!/usr/bin/bash
if [ -f "~/.bashrc" ]; then
  source ~/.bashrc
fi
if [ -f "~/.zshrc" ]; then
  source ~/.zshrc
fi
echo "sudo apt ##ACTION## ##NAME##"
echo "##PASSWORD##" | sudo -S apt ##ACTION## -y ##NAME##
