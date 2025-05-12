#!/bin/zsh
if [ -f "~/.bash_profile" ]; then
  source ~/.bash_profile
fi
if [ -f "~/.zshrc" ]; then
  source ~/.zshrc
fi
echo "arch {Arch} sudo -S port -f deactivate libuuid"
arch {Arch} sudo -S port -f deactivate libuuid
echo "arch {Arch} sudo port clean -v {Name}"
arch {Arch} sudo -S port clean -v {Name}
echo "arch {Arch} sudo port {Action} -v {Name}"
arch {Arch} sudo -S port {Action} -v {Name}
