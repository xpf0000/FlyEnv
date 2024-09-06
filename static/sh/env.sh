#!/bin/zsh
for EACH_PROFILE in ".profile" ".bashrc" ".bash_profile" ".zprofile" ".zshrc"
    do
      if [ -f "${HOME}/${EACH_PROFILE}" ]; then
        source "${HOME}/${EACH_PROFILE}"
      fi
    done
printenv
