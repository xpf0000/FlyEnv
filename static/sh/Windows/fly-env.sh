#!/usr/bin/env bash

_flyenv_config_file="${BASH_SOURCE[0]%/*}/.flyenv-bash.dir"
# Both login and interactive profiles can source this file in one session.
if [[ "${_flyenv_initialized:-}" == 1 ]]; then
  _flyenv_last_dir=''
  flyenv_autoload
  return 0
fi
_flyenv_initialized=1
_flyenv_allowed_paths=()
_flyenv_injected_paths=()
_flyenv_config_loaded=0
_flyenv_config_contents=''
_flyenv_last_dir=''
_flyenv_last_config=''
_flyenv_last_env=''

_flyenv_restore_path() {
  [[ ${#_flyenv_injected_paths[@]} -gt 0 ]] || return 0
  local entry index remove
  local -a entries=() kept=() remaining=("${_flyenv_injected_paths[@]}")
  # The extra delimiter preserves any original trailing empty PATH entry.
  IFS=: read -r -a entries <<< "$PATH:"
  for entry in "${entries[@]}"; do
    remove=0
    for index in "${!remaining[@]}"; do
      if [[ "$entry" == "${remaining[index]}" ]]; then
        unset 'remaining[index]'
        remove=1
        break
      fi
    done
    [[ "$remove" == 1 ]] || kept+=("$entry")
  done
  local IFS=:
  PATH="${kept[*]}"
  export PATH
  _flyenv_injected_paths=()
}

_flyenv_reload() {
  local contents=''
  if [[ -r "$_flyenv_config_file" ]]; then
    contents=$(< "$_flyenv_config_file")
  fi
  if [[ "$_flyenv_config_loaded" == 1 && "$contents" == "$_flyenv_config_contents" ]]; then
    return 0
  fi
  _flyenv_config_loaded=1
  _flyenv_config_contents="$contents"
  _flyenv_allowed_paths=()
  local windows_path bash_path key
  while IFS= read -r windows_path || [[ -n "$windows_path" ]]; do
    windows_path="${windows_path%$'\r'}"
    [[ -n "$windows_path" ]] || continue
    if bash_path=$(cygpath -u "$windows_path" 2>/dev/null) && [[ -d "$bash_path" ]] &&
      key=$(cygpath -aml "$windows_path" 2>/dev/null); then
      # Long Windows paths use the actual stored casing, including when cd
      # used a different spelling. Distinct case-sensitive directories stay distinct.
      _flyenv_allowed_paths+=("${key%/}")
    else
      printf '[FlyEnv] Skipping unavailable project directory: %s\n' "$windows_path" >&2
    fi
  done <<< "$contents"
}

_flyenv_load_project_file() {
  _flyenv_project_paths=()
  local line value entry bash_entry key
  local absolute_windows='^([a-zA-Z]:[\\/]|\\\\|//)'
  local -a entries=()
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" =~ ^\$env:PATH[[:space:]]*=[[:space:]]*\'(.*)\'[[:space:]]*\+[[:space:]]*\$env:PATH([[:space:]]*(#.*)?)?$ ]]; then
      value="${BASH_REMATCH[1]}"
      value="${value//\'\'/\'}"
    elif [[ "$line" =~ ^\$env:PATH[[:space:]]*=[[:space:]]*\"(.*)\"[[:space:]]*\+[[:space:]]*\$env:PATH([[:space:]]*(#.*)?)?$ ]]; then
      # Older FlyEnv releases generated double-quoted paths. Treat them only
      # as data: never evaluate PowerShell or shell expressions from .flyenv.
      value="${BASH_REMATCH[1]}"
    else
      continue
    fi
    entries=()
    IFS=';' read -r -a entries <<< "$value"
    local -a line_paths=()
    for entry in "${entries[@]}"; do
      [[ -n "$entry" ]] || continue
      if [[ "$entry" =~ $absolute_windows ]] &&
        key=$(cygpath -aml "$entry" 2>/dev/null) &&
        bash_entry=$(cygpath -u "$key" 2>/dev/null) && [[ -d "$bash_entry" ]]; then
        line_paths+=("$bash_entry")
      else
        printf '[FlyEnv] Skipping unavailable PATH entry: %s\n' "$entry" >&2
      fi
    done
    # Each PowerShell assignment prepends one ordered list to earlier lines.
    _flyenv_project_paths=("${line_paths[@]}" "${_flyenv_project_paths[@]}")
  done <<< "$_flyenv_project_contents"
}

flyenv_autoload() {
  local previous_status=$?
  _flyenv_reload
  local current_path allowed_path allowed=0 contents=''
  if ! current_path=$(cygpath -aml "$PWD" 2>/dev/null); then
    _flyenv_restore_path
    _flyenv_last_dir=''
    return "$previous_status"
  fi
  current_path="${current_path%/}"
  for allowed_path in "${_flyenv_allowed_paths[@]}"; do
    if [[ "$allowed_path" == "$current_path" ]]; then
      allowed=1
      break
    fi
  done
  if [[ "$allowed" == 1 && -r .flyenv ]]; then
    contents=$(< .flyenv)
  fi
  if [[ "$current_path" == "$_flyenv_last_dir" &&
    "$_flyenv_config_contents" == "$_flyenv_last_config" && "$contents" == "$_flyenv_last_env" ]]; then
    return "$previous_status"
  fi
  _flyenv_last_dir="$current_path"
  _flyenv_last_config="$_flyenv_config_contents"
  _flyenv_last_env="$contents"
  _flyenv_restore_path
  [[ "$allowed" == 1 && -n "$contents" ]] || return "$previous_status"

  _flyenv_project_contents="$contents"
  _flyenv_load_project_file
  local entry existing duplicate
  for entry in "${_flyenv_project_paths[@]}"; do
    duplicate=0
    for existing in "${_flyenv_injected_paths[@]}"; do
      if [[ "$entry" == "$existing" ]]; then
        duplicate=1
        break
      fi
    done
    [[ "$duplicate" == 1 ]] || _flyenv_injected_paths+=("$entry")
  done
  if [[ ${#_flyenv_injected_paths[@]} -gt 0 ]]; then
    local IFS=:
    PATH="${_flyenv_injected_paths[*]}:$PATH"
    export PATH
  fi
  if [[ ${#_flyenv_project_paths[@]} -gt 0 && "$-" == *i* ]]; then
    printf '\033[36m[FlyEnv] Loading environment variables...\033[0m\n'
    printf '\033[32m[FlyEnv] Load successful\033[0m\n'
  fi
  return "$previous_status"
}

# Preserve existing prompt handlers and user-defined cd functions. This also
# handles pushd/popd and directory changes made by other shell integrations.
if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
  declare -ag PROMPT_COMMAND
  PROMPT_COMMAND+=(flyenv_autoload)
else
  PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND$'\n'}flyenv_autoload"
fi
flyenv_autoload
