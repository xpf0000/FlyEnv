autoload -Uz colors && colors

_flyenv_allowed_paths=()
_flyenv_config_hash=""

_flyenv_msg() {
  [[ -z "$1" ]] && return
  local color="$1"
  shift

  if (( $# == 0 )); then
    print -P "%F{$color}[FlyEnv]%f"
  else
    print -P "%F{$color}[FlyEnv] ${*:1}%f"
  fi
}

_flyenv_hash() {
  local hash
  if hash=$(shasum -a 256 "$1" 2>/dev/null); then
    echo ${hash%% *}
  else
    echo "invalid"
    return 1
  fi
}

_flyenv_reload() {
  local config_file="$HOME/Library/PhpWebStudy/bin/.flyenv.dir"
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
        clean_dir="${dir_path:A}"
        clean_dir="${clean_dir%%/}"
        valid_paths+=("$clean_dir")
      fi
    done < "$config_file"
  else
    return 1
  fi

  _flyenv_allowed_paths=("${valid_paths[@]}")
}

flyenv_autoload() {
  _flyenv_reload || return
  local current_path="${PWD}" found=0
  for allow_path in "${_flyenv_allowed_paths[@]}"; do
    [[ "$allow_path" == "$current_path" ]] && { found=1; break; }
  done
  (( found )) || return

  if [[ -f ".flyenv" ]]; then
    _flyenv_msg cyan "Loading environment variables..."
    source ".flyenv" && _flyenv_msg green "✓ Load successful" || _flyenv_msg red "✗ Load failed"
  fi
}

autoload -Uz add-zsh-hook
add-zsh-hook chpwd flyenv_autoload

flyenv_autoload
