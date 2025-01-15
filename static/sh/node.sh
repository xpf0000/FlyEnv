#!/bin/bash
check_fnm_or_nvm() {
  unset PREFIX
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  local BIN
  # 有nvm
  if command -v nvm &> /dev/null 2>&1; then
    BIN="nvm"
  fi
  if command -v fnm &> /dev/null 2>&1; then
    if [[ "$BIN" == "nvm" ]]; then
      BIN="all"
    else
      BIN="fnm"
    fi
  fi
  echo "$BIN"
}

initenv() {
  for CPROFILE in ".profile" ".bashrc" ".bash_profile" ".zprofile" ".zshrc"
      do
        if [ -f "${HOME}/${CPROFILE}" ]; then
          source "${HOME}/${CPROFILE}" || true
        fi
      done
}

FLAG=$1
ARCH=$2
case $FLAG in
"check")
initenv > /dev/null 2>&1
check_fnm_or_nvm
;;
esac
