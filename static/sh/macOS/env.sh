#!/bin/zsh
initenv() {
  for EACH_PROFILE in ".profile" ".bashrc" ".bash_profile" ".zprofile" ".zshrc"
      do
        if [ -f "${HOME}/${EACH_PROFILE}" ]; then
          source "${HOME}/${EACH_PROFILE}" || true
        fi
      done
}
initenv > /dev/null 2>&1
if command -v printenv &> /dev/null; then
    printenv
    exit 0
fi
if command -v env &> /dev/null; then
    env
    exit 0
fi
if [ -f "/usr/bin/printenv" ]; then
    /usr/bin/printenv
    exit 0
fi
if [ -f "/usr/bin/env" ]; then
    /usr/bin/env
    exit 0
fi
