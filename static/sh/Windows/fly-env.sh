#!/usr/bin/env bash

_flyenv_config_file="${BASH_SOURCE[0]%/*}/.flyenv-bash.dir"
_flyenv_allowed_paths=()

_flyenv_reload() {
  _flyenv_allowed_paths=()
  [[ -f "$_flyenv_config_file" ]] || return 0

  local windows_path bash_path
  while IFS= read -r windows_path || [[ -n "$windows_path" ]]; do
    windows_path="${windows_path//$'\r'/}"
    [[ -n "$windows_path" ]] || continue
    bash_path=$(cygpath -u "$windows_path" 2>/dev/null) || continue
    bash_path="${bash_path%/}"
    _flyenv_allowed_paths+=("$bash_path")
  done < "$_flyenv_config_file"
}

_flyenv_load_project_file() {
  local line value entry bash_entry
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^\$env:PATH[[:space:]]*=[[:space:]]*\'(.*)\'[[:space:]]+\+[[:space:]]+\$env:PATH ]]; then
      value="${BASH_REMATCH[1]}"
      value="${value//\'\'/\'}"
      local -a entries=()
      IFS=';' read -ra entries <<< "$value"
      for entry in "${entries[@]}"; do
        [[ -n "$entry" ]] || continue
        bash_entry=$(cygpath -u "$entry" 2>/dev/null) || continue
        PATH="$bash_entry:$PATH"
      done
    fi
  done < .flyenv
  export PATH
}

flyenv_autoload() {
  _flyenv_reload
  local current_path="${PWD%/}"
  local allowed_path
  for allowed_path in "${_flyenv_allowed_paths[@]}"; do
    if [[ "$allowed_path" == "$current_path" ]]; then
      if [[ -f ".flyenv" ]]; then
        echo -e "\033[36m[FlyEnv] Loading environment variables...\033[0m"
        if _flyenv_load_project_file; then
          echo -e "\033[32m[FlyEnv] Load successful\033[0m"
        else
          echo -e "\033[31m[FlyEnv] Load failed\033[0m"
        fi
      fi
      return 0
    fi
  done
}

cd() {
  builtin cd "$@" && flyenv_autoload
}

flyenv_autoload
