#!/bin/bash
check_fnm_or_nvm() {
  unset PREFIX
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  local BIN
  # 有nvm
  if command -v nvm &> /dev/null; then
    BIN="nvm"
  fi
  if command -v fnm &> /dev/null; then
    if [ "$BIN" == "nvm" ]; then
      BIN="all"
    else
      BIN="fnm"
    fi
  fi
  echo "$BIN"
}

for CPROFILE in ".profile" ".bashrc" ".bash_profile" ".zprofile" ".zshrc"
    do
      if [ -f "${HOME}/${CPROFILE}" ]; then
        source "${HOME}/${CPROFILE}"
      fi
    done

FLAG=$1
ARCH=$2
case $FLAG in
"check")
check_fnm_or_nvm
;;
esac
