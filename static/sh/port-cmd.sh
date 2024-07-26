#!/bin/bash
if [ -f "~/.bashrc" ]; then
  source ~/.bashrc
fi
if [ -f "~/.zshrc" ]; then
  source ~/.zshrc
fi
echo "sudo ##PACKGER## ##ACTION## ##NAME##"
echo "##PASSWORD##" | sudo -S ##PACKGER## ##ACTION## -y ##NAME##
