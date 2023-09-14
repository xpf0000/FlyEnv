#!/bin/zsh
source ~/.bash_profile
source ~/.zshrc
echo "##ARCH## sudo port ##ACTION## -v ##NAME##"
echo "##PASSWORD##" | arch ##ARCH## sudo -S port ##ACTION## -v ##NAME##
