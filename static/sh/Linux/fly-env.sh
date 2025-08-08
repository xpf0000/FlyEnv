#!/bin/bash
# Linux-compatible version of FlyEnv loader

# Color output setup (bash compatible)
_flyenv_msg() {
  [[ -z "$1" ]] && return
  local color="$1"
  shift

  case "$color" in
    red)    color="\033[31m" ;;
    green)  color="\033[32m" ;;
    cyan)   color="\033[36m" ;;
    *)      color="\033[0m"  ;;
  esac

  if (( $# == 0 )); then
    echo -e "${color}[FlyEnv]\033[0m"
  else
    echo -e "${color}[FlyEnv] ${*:1}\033[0m"
  fi
}

# SHA256 hash calculation (Linux compatible)
_flyenv_hash() {
  local hash
  if hash=$(sha256sum "$1" 2>/dev/null); then
    echo ${hash%% *}
  else
    echo "invalid"
    return 1
  fi
}

# Path storage and reload logic
declare -a _flyenv_allowed_paths
_flyenv_config_hash=""

_flyenv_reload() {
  local config_file="$HOME/.config/FlyEnv/bin/.flyenv.dir"  # Standard Linux config path
  local -a valid_paths
  local new_hash dir_path clean_dir

  new_hash=$(_flyenv_hash "$config_file") || return

  [[ "$new_hash" == "$_flyenv_config_hash" ]] && return

  _flyenv_allowed_paths=()
  _flyenv_config_hash="$new_hash"

  if [[ -f "$config_file" ]]; then
    while IFS= read -r dir_path || [[ -n "$dir_path" ]]; do
      dir_path="${dir_path//$'\r'/}"
      if [[ "$dir_path" =~ ^/ ]]; then
        clean_dir=$(realpath -m "$dir_path")
        clean_dir="${clean_dir%%/}"
        valid_paths+=("$clean_dir")
      fi
    done < "$config_file"
  else
    return 1
  fi

  _flyenv_allowed_paths=("${valid_paths[@]}")
}

# Directory change hook
flyenv_autoload() {
  _flyenv_reload || return
  local current_path="$PWD" found=0

  for allow_path in "${_flyenv_allowed_paths[@]}"; do
    [[ "$allow_path" == "$current_path" ]] && { found=1; break; }
  done
  (( found )) || return

  if [[ -f ".flyenv" ]]; then
    _flyenv_msg cyan "Loading environment variables..."
    source ".flyenv" && _flyenv_msg green "✓ Load successful" || _flyenv_msg red "✗ Load failed"
  fi
}

# Bash equivalent of zsh's chpwd hook
cd() {
  builtin cd "$@" && flyenv_autoload
}

# Initial load
flyenv_autoload
