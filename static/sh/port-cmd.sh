#!/bin/bash
if [ -f "$HOME/.bashrc" ]; then
  source "$HOME/.bashrc"
fi
echo "sudo ##PACKGER## ##ACTION## ##NAME##"
echo "##PASSWORD##" | sudo -S ##PACKGER## ##ACTION## -y ##NAME##
echo "##PASSWORD##" | sudo -S ##PACKGER## autoremove -y
