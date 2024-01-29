#!/bin/zsh
if [ -f "~/.bash_profile" ]; then
  source ~/.bash_profile
fi
if [ -f "~/.zshrc" ]; then
  source ~/.zshrc
fi
echo "arch ##ARCH## sudo port clean -v ##NAME##"
echo "##PASSWORD##" | arch ##ARCH## sudo -S port clean -v ##NAME##
echo "arch ##ARCH## sudo port ##ACTION## -v ##NAME##"
echo "##PASSWORD##" | arch ##ARCH## sudo -S port ##ACTION## -v ##NAME##
