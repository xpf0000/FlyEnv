#!/bin/bash
nvm_echo() {
  command printf %s\\n "$*" 2>/dev/null
}

nvm_detect_profile() {
  if [ "${PROFILE-}" = '/dev/null' ]; then
    # the user has specifically requested NOT to have nvm touch their profile
    return
  fi

  if [ -n "${PROFILE}" ] && [ -f "${PROFILE}" ]; then
    nvm_echo "${PROFILE}"
    return
  fi

  local DETECTED_PROFILE
  DETECTED_PROFILE=''

  if [ "${SHELL#*bash}" != "$SHELL" ]; then
    if [ -f "$HOME/.bashrc" ]; then
      DETECTED_PROFILE="$HOME/.bashrc"
    elif [ -f "$HOME/.bash_profile" ]; then
      DETECTED_PROFILE="$HOME/.bash_profile"
    fi
  elif [ "${SHELL#*zsh}" != "$SHELL" ]; then
    if [ -f "$HOME/.zshrc" ]; then
      DETECTED_PROFILE="$HOME/.zshrc"
    elif [ -f "$HOME/.zprofile" ]; then
      DETECTED_PROFILE="$HOME/.zprofile"
    fi
  fi

  if [ -z "$DETECTED_PROFILE" ]; then
    for EACH_PROFILE in ".profile" ".bashrc" ".bash_profile" ".zprofile" ".zshrc"
    do
      if DETECTED_PROFILE="$(nvm_try_profile "${HOME}/${EACH_PROFILE}")"; then
        break
      fi
    done
  fi

  if [ -n "$DETECTED_PROFILE" ]; then
    nvm_echo "$DETECTED_PROFILE"
  fi
}

nvm_profile_is_bash_or_zsh() {
  local TEST_PROFILE
  TEST_PROFILE="${1-}"
  case "${TEST_PROFILE-}" in
    *"/.bashrc" | *"/.bash_profile" | *"/.zshrc" | *"/.zprofile")
      return
    ;;
    *)
      return 1
    ;;
  esac
}

nvm_write_to_env() {
  NVM_PROFILE="$(nvm_detect_profile)"
  if [ -f "${NVM_PROFILE-}" ] ; then
    echo "$NVM_PROFILE"
    SOURCE_STR="\\nexport NVM_DIR=\"${HOME}/.nvm\"\\n[ -s \"\$NVM_DIR/nvm.sh\" ] && \\. \"\$NVM_DIR/nvm.sh\"  # This loads nvm\\n"
     if nvm_profile_is_bash_or_zsh "${NVM_PROFILE-}"; then
       if ! command grep -qc '/nvm.sh' "$NVM_PROFILE"; then
          command printf "${SOURCE_STR}" >> "$NVM_PROFILE"
          echo "SUCCESS"
       fi
     fi
  fi
}

fnm_write_to_env() {
  NVM_PROFILE="$(nvm_detect_profile)"
  if [ -f "${NVM_PROFILE-}" ] ; then
    echo "$NVM_PROFILE"
    SOURCE_STR="\\ncommand -v fnm &> /dev/null && eval \"\$(fnm env --use-on-cd)\"\\n"
     if nvm_profile_is_bash_or_zsh "${NVM_PROFILE-}"; then
       if ! command grep -qc 'fnm env' "$NVM_PROFILE"; then
          command printf "${SOURCE_STR}" >> "$NVM_PROFILE"
          echo "SUCCESS"
       fi
     fi
  fi
}

install_nvm_by_shell() {
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
}

install_nvm_by_brew() {
  local ARCH
  ARCH="${1-}"
  arch "$ARCH" brew install nvm
  local BREW_HOME
  BREW_HOME="$(brew --repo)"
  nvm_write_to_env
  if [ -f "$BREW_HOME/opt/nvm/nvm.sh" ] ; then
    source "$BREW_HOME/opt/nvm/nvm.sh"
  fi
}

install_nvm_by_port() {
  local ARCH
  ARCH="${1-}"
  arch "$ARCH" sudo -S port clean -v nvm
  arch "$ARCH" sudo -S port install -v nvm
  nvm_write_to_env
  if [ -f "/opt/local/share/nvm/init-nvm.sh" ] ; then
      source "/opt/local/share/nvm/init-nvm.sh"
  fi
}

install_fnm_by_brew() {
  local ARCH
  ARCH="${1-}"
  arch "$ARCH" brew install fnm
  fnm_write_to_env
}

install_fnm_by_port() {
  local ARCH
  ARCH="${1-}"
  arch "$ARCH" sudo -S port clean -v fnm
  arch "$ARCH" sudo -S port install -v fnm
  fnm_write_to_env
}

check_fnm_or_nvm() {
  export NVM_DIR="${HOME}/.nvm"
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
"nvm-shell")
install_nvm_by_shell
;;
"nvm-brew")
install_nvm_by_brew "$ARCH"
;;
"nvm-port")
install_nvm_by_port "$ARCH"
;;
"fnm-brew")
install_fnm_by_brew "$ARCH"
;;
"fnm-port")
install_fnm_by_port "$ARCH"
;;
esac
