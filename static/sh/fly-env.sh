# FlyEnv AutoLoader
typeset -gA __flyenv_cache
__flyenv_cache[allowed_paths]=()

autoload_flyenv() {
  local current_path="${PWD}"
  (( $__flyenv_cache[allowed_paths][(Ie)$current_path] )) || return

  [[ -f ".flyenv" ]] || return

  # 直接加载.flyenv文件
  echo "[FlyEnv] Loading environment variables..."
  if source ".flyenv"; then
    echo "[FlyEnv] Load successful"
  else
    echo "[FlyEnv] Load failed"
  fi
}

# 初始化函数（仅在脚本目录查找.flyenv.dir）
init_flyenv() {
  # 确定脚本所在目录
  local script_dir="${0:a:h}"

  # 只查找脚本目录下的.flyenv.dir
  local config_file="$script_dir/.flyenv.dir"

  if [[ -f "$config_file" ]]; then
    echo "[FlyEnv] Loading allowed paths from $config_file"

    # 严格绝对路径解析
    while IFS= read -r path; do
      # 仅接受以/开头的绝对路径
      if [[ "$path" =~ ^/ ]]; then
        # 规范化路径（去除末尾/）
        local clean_path="${path:A}"
        __flyenv_cache[allowed_paths]+=("${clean_path%%/}")
      else
        echo "[FlyEnv] Ignoring non-absolute path: $path"
      fi
    done < "$config_file"

    if (( ${#__flyenv_cache[allowed_paths]} > 0 )); then
      echo "[FlyEnv] Loaded ${#__flyenv_cache[allowed_paths]} allowed paths"
    else
      echo "[FlyEnv] Warning: No valid absolute paths found"
    fi
  else
    echo "[FlyEnv] Strict mode: No .flyenv.dir found in script directory ($script_dir)"
    echo "[FlyEnv] ALL paths are DENIED"
  fi
}

# 注册钩子
autoload -Uz add-zsh-hook
add-zsh-hook chpwd autoload_flyenv

# 初始化
init_flyenv
autoload_flyenv
