#!/usr/bin/bash
# 字符串染色程序
if [[ -t 1 ]]; then
  tty_escape() { printf "\033[%sm" "$1"; }
else
  tty_escape() { :; }
fi
tty_universal() { tty_escape "0;$1"; } #正常显示
tty_green="$(tty_universal 32)" #绿色
tty_reset="$(tty_escape 0)" #去除颜色
hasBrew=$(which brew)
if ! [[ "$hasBrew" == "brew not found" ]]; then
    echo -n "${tty_green}
    Detects that brew is installed, and the installer script exits automatically.${tty_reset}"
    echo "PhpWebStudy-End of Brew installation"
    exit 0
fi

password=$1
echo "$password" | sudo -S -v
echo "
              ${tty_green} Starting the Brew installer ${tty_reset}
"
echo -n "${tty_green}
->Whether to start executing the script now（Y/N） "
read MY_Del_Old
echo "${tty_reset}"
case $MY_Del_Old in
"y")
echo "--> Script execution begins"
;;
"Y")
echo "--> Script execution begins"
;;
*)
echo "You typed $MY_Del_Old and the installation exited. if you continue to run the script you should type Y or y"
echo "PhpWebStudy-End of Brew installation"
exit 0
;;
esac

/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
echo "PhpWebStudy-End of Brew installation"
